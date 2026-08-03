package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var ErrNotFound = errors.New("auth record not found")

type Repository struct {
	database *sql.DB
}

func NewRepository(database *sql.DB) *Repository {
	return &Repository{database: database}
}

func (repository *Repository) CreateUser(ctx context.Context, user User) error {
	_, err := repository.database.ExecContext(ctx, `INSERT INTO users (id, name, email, email_verified, image, slide_tokens, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`, user.ID, user.Name, user.Email, user.EmailVerified, user.Image, user.SlideTokens, user.CreatedAt)
	return err
}

func (repository *Repository) CreateCredential(ctx context.Context, id, userID, password string) error {
	_, err := repository.database.ExecContext(ctx, `INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES ($1, $2, 'credential', $2, $3, NOW(), NOW())`, id, userID, password)
	return err
}

func (repository *Repository) CreateUserWithCredential(ctx context.Context, user User, accountID, password string) error {
	transaction, err := repository.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer transaction.Rollback()
	if _, err = transaction.ExecContext(ctx, `INSERT INTO users (id, name, email, email_verified, image, slide_tokens, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`, user.ID, user.Name, user.Email, user.EmailVerified, user.Image, user.SlideTokens, user.CreatedAt); err != nil {
		return err
	}
	if _, err = transaction.ExecContext(ctx, `INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES ($1, $2, 'credential', $2, $3, NOW(), NOW())`, accountID, user.ID, password); err != nil {
		return err
	}
	return transaction.Commit()
}

func (repository *Repository) UserByID(ctx context.Context, id string) (User, error) {
	return scanUser(repository.database.QueryRowContext(ctx, `SELECT id, name, email, email_verified, image, slide_tokens, created_at, updated_at FROM users WHERE id = $1`, id))
}

func (repository *Repository) UserByEmail(ctx context.Context, email string) (User, error) {
	return scanUser(repository.database.QueryRowContext(ctx, `SELECT id, name, email, email_verified, image, slide_tokens, created_at, updated_at FROM users WHERE email = $1`, email))
}

func (repository *Repository) CredentialByUserID(ctx context.Context, userID string) (string, string, error) {
	var id, password string
	err := repository.database.QueryRowContext(ctx, `SELECT id, password FROM accounts WHERE user_id = $1 AND provider_id = 'credential' AND password IS NOT NULL ORDER BY created_at DESC LIMIT 1`, userID).Scan(&id, &password)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", ErrNotFound
	}
	return id, password, err
}

func (repository *Repository) UpdateCredentialPassword(ctx context.Context, id, password string) error {
	_, err := repository.database.ExecContext(ctx, `UPDATE accounts SET password = $2, updated_at = NOW() WHERE id = $1`, id, password)
	return err
}

func (repository *Repository) CreateSession(ctx context.Context, session Session, userAgent, ipAddress string) error {
	_, err := repository.database.ExecContext(ctx, `INSERT INTO sessions (id, token, user_id, user_agent, ip_address, expires_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`, session.ID, session.Token, session.UserID, userAgent, ipAddress, session.ExpiresAt)
	return err
}

func (repository *Repository) SessionByToken(ctx context.Context, token string, now time.Time) (Session, User, error) {
	var session Session
	var user User
	err := repository.database.QueryRowContext(ctx, `SELECT s.id, s.token, s.user_id, s.expires_at, u.id, u.name, u.email, u.email_verified, u.image, u.slide_tokens, u.created_at, u.updated_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > $2`, token, now).Scan(&session.ID, &session.Token, &session.UserID, &session.ExpiresAt, &user.ID, &user.Name, &user.Email, &user.EmailVerified, &user.Image, &user.SlideTokens, &user.CreatedAt, &user.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, User{}, ErrNotFound
	}
	return session, user, err
}

func (repository *Repository) DeleteSession(ctx context.Context, token string) error {
	_, err := repository.database.ExecContext(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	return err
}

func (repository *Repository) DeleteOtherSessions(ctx context.Context, userID, currentToken string) error {
	_, err := repository.database.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = $1 AND token <> $2`, userID, currentToken)
	return err
}

func (repository *Repository) UpdateName(ctx context.Context, userID, name string) (User, error) {
	return scanUser(repository.database.QueryRowContext(ctx, `UPDATE users SET name = $2, updated_at = NOW() WHERE id = $1 RETURNING id, name, email, email_verified, image, slide_tokens, created_at, updated_at`, userID, name))
}

func (repository *Repository) UpdateImage(ctx context.Context, userID, image string) (User, error) {
	return scanUser(repository.database.QueryRowContext(ctx, `UPDATE users SET image = $2, updated_at = NOW() WHERE id = $1 RETURNING id, name, email, email_verified, image, slide_tokens, created_at, updated_at`, userID, image))
}

func (repository *Repository) ReplaceVerification(ctx context.Context, verification Verification, prefix string) error {
	transaction, err := repository.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer transaction.Rollback()
	if _, err = transaction.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, prefix); err != nil {
		return err
	}
	if _, err = transaction.ExecContext(ctx, `DELETE FROM verifications WHERE identifier LIKE $1`, prefix+"%"); err != nil {
		return err
	}
	if _, err = transaction.ExecContext(ctx, `INSERT INTO verifications (id, identifier, value, expires_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)`, verification.ID, verification.Identifier, verification.Value, verification.ExpiresAt, verification.CreatedAt); err != nil {
		return err
	}
	return transaction.Commit()
}

func (repository *Repository) VerificationByIdentifier(ctx context.Context, identifier string, now time.Time) (Verification, error) {
	var verification Verification
	err := repository.database.QueryRowContext(ctx, `SELECT id, identifier, value, expires_at, created_at FROM verifications WHERE identifier = $1 AND expires_at > $2 ORDER BY created_at DESC LIMIT 1`, identifier, now).Scan(&verification.ID, &verification.Identifier, &verification.Value, &verification.ExpiresAt, &verification.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Verification{}, ErrNotFound
	}
	return verification, err
}

func (repository *Repository) DeleteVerification(ctx context.Context, id string) error {
	_, err := repository.database.ExecContext(ctx, `DELETE FROM verifications WHERE id = $1`, id)
	return err
}

func (repository *Repository) VerifyUserEmail(ctx context.Context, userID, verificationID, identifier string, now time.Time) (User, error) {
	transaction, err := repository.database.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer transaction.Rollback()
	result, err := transaction.ExecContext(ctx, `DELETE FROM verifications WHERE id = $1 AND identifier = $2 AND expires_at > $3`, verificationID, identifier, now)
	if err != nil {
		return User{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return User{}, ErrNotFound
	}
	user, err := scanUser(transaction.QueryRowContext(ctx, `UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1 RETURNING id, name, email, email_verified, image, slide_tokens, created_at, updated_at`, userID))
	if err != nil {
		return User{}, err
	}
	return user, transaction.Commit()
}

func (repository *Repository) CompleteEmailChange(ctx context.Context, userID, email, verificationID string, now time.Time) (User, error) {
	transaction, err := repository.database.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer transaction.Rollback()
	if _, err = transaction.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, "email-change-otp-"+userID); err != nil {
		return User{}, err
	}
	var previousEmail string
	if err = transaction.QueryRowContext(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&previousEmail); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, err
	}
	result, err := transaction.ExecContext(ctx, `DELETE FROM verifications WHERE id = $1 AND identifier = $2 AND expires_at > $3`, verificationID, "email-change-otp-"+userID+"-"+email, now)
	if err != nil {
		return User{}, err
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return User{}, ErrNotFound
	}
	user, err := scanUser(transaction.QueryRowContext(ctx, `UPDATE users SET email = $2, email_verified = true, updated_at = NOW() WHERE id = $1 RETURNING id, name, email, email_verified, image, slide_tokens, created_at, updated_at`, userID, email))
	if err != nil {
		return User{}, err
	}
	if _, err = transaction.ExecContext(ctx, `DELETE FROM verifications WHERE identifier IN ($1, $2, $3, $4, $5, $6)`, "email-verification-otp-"+previousEmail, "sign-in-otp-"+previousEmail, "forget-password-otp-"+previousEmail, "email-verification-otp-"+email, "sign-in-otp-"+email, "forget-password-otp-"+email); err != nil {
		return User{}, err
	}
	return user, transaction.Commit()
}

type rowScanner interface {
	Scan(...any) error
}

func scanUser(row rowScanner) (User, error) {
	var user User
	err := row.Scan(&user.ID, &user.Name, &user.Email, &user.EmailVerified, &user.Image, &user.SlideTokens, &user.CreatedAt, &user.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return user, err
}

func (repository *Repository) ResetPassword(ctx context.Context, userID, accountID, verificationID, identifier, password string, now time.Time) error {
	transaction, err := repository.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer transaction.Rollback()
	result, err := transaction.ExecContext(ctx, `DELETE FROM verifications WHERE id = $1 AND identifier = $2 AND expires_at > $3`, verificationID, identifier, now)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return ErrNotFound
	}
	if _, err = transaction.ExecContext(ctx, `UPDATE accounts SET password = $2, updated_at = NOW() WHERE id = $1 AND user_id = $3`, accountID, password, userID); err != nil {
		return err
	}
	if _, err = transaction.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID); err != nil {
		return err
	}
	return transaction.Commit()
}

func (repository *Repository) UpsertOAuthUser(ctx context.Context, provider, providerAccountID, name, email, image, accessToken, refreshToken string, now time.Time) (User, error) {
	transaction, err := repository.database.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer transaction.Rollback()
	existing := transaction.QueryRowContext(ctx, `SELECT u.id, u.name, u.email, u.email_verified, u.image, u.slide_tokens, u.created_at, u.updated_at FROM accounts a JOIN users u ON u.id = a.user_id WHERE a.provider_id = $1 AND a.account_id = $2`, provider, providerAccountID)
	user, err := scanUser(existing)
	if err == nil {
		if _, err = transaction.ExecContext(ctx, `UPDATE accounts SET access_token = $1, refresh_token = NULLIF($2, ''), updated_at = NOW() WHERE provider_id = $3 AND account_id = $4`, accessToken, refreshToken, provider, providerAccountID); err != nil {
			return User{}, err
		}
		if err = transaction.Commit(); err != nil {
			return User{}, err
		}
		return user, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return User{}, err
	}
	user, err = scanUser(transaction.QueryRowContext(ctx, `SELECT id, name, email, email_verified, image, slide_tokens, created_at, updated_at FROM users WHERE email = $1 FOR UPDATE`, email))
	if errors.Is(err, ErrNotFound) {
		userID, idErr := randomID()
		if idErr != nil {
			return User{}, idErr
		}
		user = User{ID: userID, Name: name, Email: email, EmailVerified: true, SlideTokens: 50, CreatedAt: now, UpdatedAt: now}
		if image != "" {
			user.Image = &image
		}
		if _, err = transaction.ExecContext(ctx, `INSERT INTO users (id, name, email, email_verified, image, slide_tokens, created_at, updated_at) VALUES ($1, $2, $3, true, $4, 50, $5, $5)`, user.ID, user.Name, user.Email, user.Image, now); err != nil {
			return User{}, err
		}
	} else if err != nil {
		return User{}, err
	}
	accountID, err := randomID()
	if err != nil {
		return User{}, err
	}
	if _, err = transaction.ExecContext(ctx, `INSERT INTO accounts (id, user_id, account_id, provider_id, access_token, refresh_token, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), NOW(), NOW())`, accountID, user.ID, providerAccountID, provider, accessToken, refreshToken); err != nil {
		return User{}, err
	}
	if err = transaction.Commit(); err != nil {
		return User{}, err
	}
	return user, nil
}
