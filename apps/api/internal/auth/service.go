package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrEmailUnverified    = errors.New("email address is not verified")
	ErrEmailInUse         = errors.New("email already in use")
	ErrInvalidOTP         = errors.New("verification code is invalid or expired")
	ErrEmailDelivery      = errors.New("email delivery is temporarily unavailable")
)

var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

type Service struct {
	config     Config
	repository *Repository
}

func NewService(config Config) (*Service, error) {
	config = config.normalized()
	if config.Database == nil {
		return nil, errors.New("auth database is required")
	}
	if config.SecureCookies && (len(config.AuthSecret) < 32 || strings.HasPrefix(config.AuthSecret, "replace-") || strings.HasPrefix(config.AuthSecret, "your-")) {
		return nil, errors.New("AUTH_SECRET must be a non-placeholder value of at least 32 characters")
	}
	return &Service{config: config, repository: NewRepository(config.Database)}, nil
}

func (service *Service) SignUp(ctx context.Context, name, email, password string) (User, error) {
	name = strings.TrimSpace(name)
	email = normalizeEmail(email)
	if name == "" || len(name) > 100 || email == "" || len(password) < 8 {
		return User{}, errors.New("name, valid email, and a password of at least 8 characters are required")
	}
	if existingUser, err := service.repository.UserByEmail(ctx, email); err == nil {
		if !existingUser.EmailVerified {
			return existingUser, ErrEmailUnverified
		}
		return User{}, ErrEmailInUse
	} else if !errors.Is(err, ErrNotFound) {
		return User{}, err
	}
	hash, err := hashPassword(password)
	if err != nil {
		return User{}, err
	}
	now := service.config.Now().UTC()
	userID, err := randomID()
	if err != nil {
		return User{}, err
	}
	accountID, err := randomID()
	if err != nil {
		return User{}, err
	}
	user := User{ID: userID, Name: name, Email: email, SlideTokens: 50, CreatedAt: now, UpdatedAt: now}
	if err := service.repository.CreateUserWithCredential(ctx, user, accountID, hash); err != nil {
		return User{}, err
	}
	return user, nil
}

func (service *Service) CleanupExpiredUnverifiedUsers(ctx context.Context) (int64, error) {
	now := service.config.Now().UTC()
	return service.repository.DeleteExpiredUnverifiedUsers(ctx, now.Add(-service.config.UnverifiedTTL), now)
}

func (service *Service) SignIn(ctx context.Context, email, password string) (JWTAuth, User, error) {
	user, err := service.repository.UserByEmail(ctx, normalizeEmail(email))
	if err != nil {
		return JWTAuth{}, User{}, ErrInvalidCredentials
	}
	accountID, hash, err := service.repository.CredentialByUserID(ctx, user.ID)
	if err != nil || !verifyPassword(hash, password) {
		return JWTAuth{}, User{}, ErrInvalidCredentials
	}
	if needsPasswordUpgrade(hash) {
		upgradedHash, upgradeErr := hashPassword(password)
		if upgradeErr == nil {
			_ = service.repository.UpdateCredentialPassword(ctx, accountID, upgradedHash)
		}
	}
	if !user.EmailVerified {
		return JWTAuth{}, User{}, ErrEmailUnverified
	}
	session, err := service.issueJWT(ctx, user.ID)
	if err != nil {
		return JWTAuth{}, User{}, err
	}
	return session, user, nil
}

func (service *Service) issueJWT(ctx context.Context, userID string) (JWTAuth, error) {
	user, err := service.repository.UserByID(ctx, userID)
	if err != nil {
		return JWTAuth{}, err
	}
	token, err := service.GenerateJWT(userID, user.Email, service.config.JWTTTL)
	if err != nil {
		return JWTAuth{}, err
	}
	now := service.config.Now().UTC()
	return JWTAuth{ID: userID, Token: token, UserID: userID, ExpiresAt: now.Add(service.config.JWTTTL)}, nil
}

func (service *Service) AuthenticateJWT(ctx context.Context, token string) (JWTAuth, User, error) {
	if token == "" {
		return JWTAuth{}, User{}, ErrNotFound
	}
	userID, err := service.VerifyJWT(token)
	if err != nil {
		return JWTAuth{}, User{}, ErrNotFound
	}
	user, err := service.repository.UserByID(ctx, userID)
	if err != nil {
		return JWTAuth{}, User{}, ErrNotFound
	}
	now := service.config.Now().UTC()
	return JWTAuth{ID: userID, Token: token, UserID: userID, ExpiresAt: now.Add(service.config.JWTTTL)}, user, nil
}

func (service *Service) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	if len(newPassword) < 8 {
		return errors.New("new password must be at least 8 characters")
	}
	accountID, hash, err := service.repository.CredentialByUserID(ctx, userID)
	if err != nil || !verifyPassword(hash, currentPassword) {
		return ErrInvalidCredentials
	}
	replacement, err := hashPassword(newPassword)
	if err != nil {
		return err
	}
	if err = service.repository.UpdateCredentialPassword(ctx, accountID, replacement); err != nil {
		return err
	}
	return nil
}

func (service *Service) SendVerificationOTP(ctx context.Context, email string) error {
	email = normalizeEmail(email)
	if email == "" {
		return errors.New("enter a valid email address")
	}
	user, err := service.repository.UserByEmail(ctx, email)
	if err != nil {
		return ErrNotFound
	}
	code, err := randomOTP()
	if err != nil {
		return err
	}
	now := service.config.Now().UTC()
	identifier := "email-verification-otp-" + email
	verificationID, err := randomID()
	if err != nil {
		return err
	}
	verification := Verification{ID: verificationID, Identifier: identifier, Value: service.emailChangeHash(user.ID, email, code), ExpiresAt: now.Add(15 * time.Minute), CreatedAt: now}
	if err = service.repository.ReplaceVerification(ctx, verification, identifier); err != nil {
		return err
	}
	if service.config.EmailSender != nil {
		if err = service.config.EmailSender.SendOTP(ctx, email, code, "email-verification", user.Name); err != nil {
			_ = service.repository.DeleteVerification(ctx, verification.ID)
			return err
		}
	}
	return nil
}

func (service *Service) SendPasswordResetOTP(ctx context.Context, email string) error {
	email = normalizeEmail(email)
	if email == "" {
		return errors.New("enter a valid email address")
	}
	user, err := service.repository.UserByEmail(ctx, email)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	code, err := randomOTP()
	if err != nil {
		return err
	}
	id, err := randomID()
	if err != nil {
		return err
	}
	now := service.config.Now().UTC()
	identifier := "forget-password-otp-" + email
	verification := Verification{ID: id, Identifier: identifier, Value: service.emailChangeHash(user.ID, email, code), ExpiresAt: now.Add(15 * time.Minute), CreatedAt: now}
	if err = service.repository.ReplaceVerification(ctx, verification, identifier); err != nil {
		return err
	}
	if service.config.EmailSender != nil {
		if err = service.config.EmailSender.SendOTP(ctx, email, code, "forget-password", user.Name); err != nil {
			_ = service.repository.DeleteVerification(ctx, verification.ID)
			return err
		}
	}
	return nil
}

func (service *Service) ResetPassword(ctx context.Context, email, code, password string) error {
	email = normalizeEmail(email)
	if email == "" || !regexp.MustCompile(`^\d{6}$`).MatchString(code) || len(password) < 8 {
		return ErrInvalidOTP
	}
	user, err := service.repository.UserByEmail(ctx, email)
	if err != nil {
		return ErrInvalidOTP
	}
	identifier := "forget-password-otp-" + email
	verification, err := service.repository.VerificationByIdentifier(ctx, identifier, service.config.Now().UTC())
	if err != nil || subtle.ConstantTimeCompare([]byte(verification.Value), []byte(service.emailChangeHash(user.ID, email, code))) != 1 {
		return ErrInvalidOTP
	}
	accountID, _, err := service.repository.CredentialByUserID(ctx, user.ID)
	if err != nil {
		return err
	}
	hash, err := hashPassword(password)
	if err != nil {
		return err
	}
	return service.repository.ResetPassword(ctx, user.ID, accountID, verification.ID, identifier, hash, service.config.Now().UTC())
}

func (service *Service) VerifyAccountEmail(ctx context.Context, email, code string) (User, error) {
	email = normalizeEmail(email)
	if email == "" || !regexp.MustCompile(`^\d{6}$`).MatchString(code) {
		return User{}, ErrInvalidOTP
	}
	user, err := service.repository.UserByEmail(ctx, email)
	if err != nil {
		return User{}, ErrInvalidOTP
	}
	identifier := "email-verification-otp-" + email
	verification, err := service.repository.VerificationByIdentifier(ctx, identifier, service.config.Now().UTC())
	if err != nil || subtle.ConstantTimeCompare([]byte(verification.Value), []byte(service.emailChangeHash(user.ID, email, code))) != 1 {
		return User{}, ErrInvalidOTP
	}
	verified, err := service.repository.VerifyUserEmail(ctx, user.ID, verification.ID, identifier, service.config.Now().UTC())
	if errors.Is(err, ErrNotFound) {
		return User{}, ErrInvalidOTP
	}
	return verified, err
}

func (service *Service) Profile(ctx context.Context, userID string) (User, error) {
	return service.repository.UserByID(ctx, userID)
}

func (service *Service) UpdateName(ctx context.Context, userID, name string) (User, error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 100 {
		return User{}, errors.New("name must be between 1 and 100 characters")
	}
	return service.repository.UpdateName(ctx, userID, name)
}

func (service *Service) UpdateAvatar(ctx context.Context, userID, image string) (User, error) {
	image = strings.TrimSpace(image)
	parsed, err := url.Parse(image)
	if err != nil || len(image) > 2048 || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || containsControlCharacter(image) {
		return User{}, errors.New("image URL must be a valid HTTPS URL without credentials")
	}
	return service.repository.UpdateImage(ctx, userID, image)
}

func (service *Service) StartEmailChange(ctx context.Context, userID, password, email string) (User, error) {
	email = normalizeEmail(email)
	if email == "" {
		return User{}, errors.New("enter a valid email address")
	}
	accountID, hash, err := service.repository.CredentialByUserID(ctx, userID)
	_ = accountID
	if err != nil || !verifyPassword(hash, password) {
		return User{}, ErrInvalidCredentials
	}
	existing, err := service.repository.UserByEmail(ctx, email)
	if err == nil && existing.ID != userID {
		return User{}, ErrEmailInUse
	}
	if err != nil && !errors.Is(err, ErrNotFound) {
		return User{}, err
	}
	user, err := service.repository.UserByID(ctx, userID)
	if err != nil {
		return User{}, err
	}
	code, err := randomOTP()
	if err != nil {
		return User{}, err
	}
	now := service.config.Now().UTC()
	verificationID, err := randomID()
	if err != nil {
		return User{}, err
	}
	verification := Verification{ID: verificationID, Identifier: emailChangeIdentifier(userID, email), Value: service.emailChangeHash(userID, email, code), ExpiresAt: now.Add(15 * time.Minute), CreatedAt: now}
	if err = service.repository.ReplaceVerification(ctx, verification, "email-change-otp-"+userID+"-"); err != nil {
		return User{}, err
	}
	if service.config.EmailSender != nil {
		if err = service.config.EmailSender.SendOTP(ctx, email, code, "email-verification", user.Name); err != nil {
			_ = service.repository.DeleteVerification(ctx, verification.ID)
			return User{}, err
		}
	}
	return user, nil
}

func (service *Service) VerifyEmailChange(ctx context.Context, userID, email, code string) (User, error) {
	email = normalizeEmail(email)
	if email == "" || !regexp.MustCompile(`^\d{6}$`).MatchString(code) {
		return User{}, ErrInvalidOTP
	}
	verification, err := service.repository.VerificationByIdentifier(ctx, emailChangeIdentifier(userID, email), service.config.Now().UTC())
	if err != nil || subtle.ConstantTimeCompare([]byte(verification.Value), []byte(service.emailChangeHash(userID, email, code))) != 1 {
		return User{}, ErrInvalidOTP
	}
	user, err := service.repository.CompleteEmailChange(ctx, userID, email, verification.ID, service.config.Now().UTC())
	if errors.Is(err, ErrNotFound) {
		return User{}, ErrInvalidOTP
	}
	return user, err
}

func (service *Service) emailChangeHash(userID, email, code string) string {
	mac := hmac.New(sha256.New, []byte(service.config.AuthSecret))
	_, _ = mac.Write([]byte(userID + "\x00" + email + "\x00" + code))
	return hex.EncodeToString(mac.Sum(nil))
}

func emailChangeIdentifier(userID, email string) string {
	return "email-change-otp-" + userID + "-" + email
}

func normalizeEmail(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	if len(email) < 3 || len(email) > 255 || !emailPattern.MatchString(email) {
		return ""
	}
	return email
}

func containsControlCharacter(value string) bool {
	for _, character := range value {
		if character <= 31 || character == 127 {
			return true
		}
	}
	return false
}

func randomID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	bytes[6] = bytes[6]&0x0f | 0x40
	bytes[8] = bytes[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", bytes[0:4], bytes[4:6], bytes[6:8], bytes[8:10], bytes[10:16]), nil
}

func randomOTP() (string, error) {
	bytes := make([]byte, 4)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	value := uint32(bytes[0])<<24 | uint32(bytes[1])<<16 | uint32(bytes[2])<<8 | uint32(bytes[3])
	return fmt.Sprintf("%06d", value%1000000), nil
}
