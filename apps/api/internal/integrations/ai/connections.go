package ai

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

type Connection struct {
	UserID, Provider, EncryptedAPIKey, EncryptionIV, KeyLastFour, Status string
	EncryptionKeyVersion                                                 int
	ValidatedAt                                                          time.Time
	LastUsedAt                                                           *time.Time
}

type Selection struct {
	Provider Provider `json:"provider"`
	Model    string   `json:"model"`
}

// Preference holds the persisted generation-runtime choice. UseByok keeps
// direct provider billing selectable while Selection stores the last chosen
// provider model, even while the toggle routes generation through SlideSage.
type Preference struct {
	UseByok   bool
	Selection *Selection
}

type ConnectionService struct{ DB *sql.DB }

// Connect validates first, then stores an authenticated AES-GCM encrypted key in ai_provider_connections.
func (s ConnectionService) Connect(ctx context.Context, userID string, provider Provider, apiKey string) (Connection, []ModelDescriptor, error) {
	if s.DB == nil {
		return Connection{}, nil, errors.New("database is required")
	}
	key := strings.TrimSpace(apiKey)
	if len(key) < 8 || len(key) > 512 || strings.ContainsAny(key, "\r\n\x00") {
		return Connection{}, nil, errors.New("enter a valid API key")
	}
	if err := s.requireEligibility(ctx, userID); err != nil {
		return Connection{}, nil, err
	}
	models, err := ValidateProviderKey(ctx, provider, key, nil)
	if err != nil {
		return Connection{}, nil, err
	}
	credential, err := EncryptAPIKey(userID, provider, key)
	if err != nil {
		return Connection{}, nil, err
	}
	connection, err := s.upsert(ctx, userID, provider, credential)
	if err != nil {
		return Connection{}, nil, err
	}
	selection, err := s.GetSelection(ctx, userID)
	if err != nil {
		return Connection{}, nil, err
	}
	if selection == nil && len(models) > 0 {
		selected := models[0]
		if err := s.SetSelection(ctx, userID, Selection{selected.Provider, selected.Model}); err != nil {
			return Connection{}, nil, err
		}
	}
	return connection, models, nil
}

func (s ConnectionService) List(ctx context.Context, userID string) ([]Connection, error) {
	if s.DB == nil {
		return nil, errors.New("database is required")
	}
	rows, err := s.DB.QueryContext(ctx, `SELECT user_id, provider, encrypted_api_key, encryption_iv, encryption_key_version, key_last_four, status, validated_at, last_used_at FROM ai_provider_connections WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Connection{}
	for rows.Next() {
		connection, err := scanConnection(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, connection)
	}
	return result, rows.Err()
}

// GetPreference loads the stored generation-runtime preference. Users without
// a preferences row default to BYOK with no selection.
func (s ConnectionService) GetPreference(ctx context.Context, userID string) (Preference, error) {
	if s.DB == nil {
		return Preference{}, errors.New("database is required")
	}
	var useByok sql.NullBool
	var provider, model sql.NullString
	err := s.DB.QueryRowContext(ctx, `SELECT use_byok, selected_provider, selected_model FROM user_ai_preferences WHERE user_id = $1`, userID).Scan(&useByok, &provider, &model)
	if errors.Is(err, sql.ErrNoRows) {
		return Preference{UseByok: true}, nil
	}
	if err != nil {
		return Preference{}, err
	}
	preference := Preference{UseByok: !useByok.Valid || useByok.Bool}
	if provider.Valid && model.Valid {
		preference.Selection = &Selection{Provider(provider.String), model.String}
	}
	return preference, nil
}

func (s ConnectionService) GetSelection(ctx context.Context, userID string) (*Selection, error) {
	preference, err := s.GetPreference(ctx, userID)
	if err != nil {
		return nil, err
	}
	return preference.Selection, nil
}

// SetByokEnabled persists the generation-runtime toggle without touching the
// saved selection or any stored provider key.
func (s ConnectionService) SetByokEnabled(ctx context.Context, userID string, enabled bool) error {
	if s.DB == nil {
		return errors.New("database is required")
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO user_ai_preferences (user_id, selected_provider, selected_model, use_byok) VALUES ($1, NULL, NULL, $2) ON CONFLICT (user_id) DO UPDATE SET use_byok = EXCLUDED.use_byok, updated_at = NOW()`, userID, enabled)
	return err
}

func (s ConnectionService) SetSelection(ctx context.Context, userID string, selection Selection) error {
	if s.DB == nil {
		return errors.New("database is required")
	}
	if selection.Provider != OpenAI && selection.Provider != Google && selection.Provider != Anthropic || normalizeModelID(selection.Model) == "" {
		return errors.New("invalid AI model selection")
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO user_ai_preferences (user_id, selected_provider, selected_model) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET selected_provider = EXCLUDED.selected_provider, selected_model = EXCLUDED.selected_model, updated_at = NOW()`, userID, selection.Provider, selection.Model)
	return err
}

// Select validates that the user remains eligible, connected, and that the model
// is still available before persisting the preference.
func (s ConnectionService) Select(ctx context.Context, userID string, selection Selection) error {
	if err := s.requireEligibility(ctx, userID); err != nil {
		return err
	}
	selected, _, err := s.ResolveSelection(ctx, userID, &selection)
	if err != nil {
		return err
	}
	if selected == nil {
		return errors.New("connect this provider first")
	}
	return s.SetSelection(ctx, userID, *selected)
}

func (s ConnectionService) Delete(ctx context.Context, userID string, provider Provider) error {
	if s.DB == nil {
		return errors.New("database is required")
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `DELETE FROM ai_provider_connections WHERE user_id = $1 AND provider = $2`, userID, provider); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM user_ai_preferences WHERE user_id = $1 AND selected_provider = $2`, userID, provider); err != nil {
		return err
	}
	return tx.Commit()
}

func (s ConnectionService) MarkUsed(ctx context.Context, userID string, provider Provider) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE ai_provider_connections SET last_used_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND provider = $2`, userID, provider)
	return err
}
func (s ConnectionService) MarkInvalid(ctx context.Context, userID string, provider Provider) error {
	_, err := s.DB.ExecContext(ctx, `UPDATE ai_provider_connections SET status = 'invalid', updated_at = NOW() WHERE user_id = $1 AND provider = $2`, userID, provider)
	return err
}

func (s ConnectionService) ResolveSelection(ctx context.Context, userID string, requested *Selection) (*Selection, string, error) {
	selected := requested
	if selected == nil {
		var err error
		selected, err = s.GetSelection(ctx, userID)
		if err != nil {
			return nil, "", err
		}
	}
	if selected == nil {
		return nil, "", nil
	}
	var encrypted EncryptedCredential
	var status string
	err := s.DB.QueryRowContext(ctx, `SELECT encrypted_api_key, encryption_iv, encryption_key_version, key_last_four, status FROM ai_provider_connections WHERE user_id = $1 AND provider = $2`, userID, selected.Provider).Scan(&encrypted.EncryptedAPIKey, &encrypted.EncryptionIV, &encrypted.EncryptionKeyVersion, &encrypted.KeyLastFour, &status)
	if errors.Is(err, sql.ErrNoRows) || status != "valid" {
		return nil, "", errors.New("the selected AI provider is not connected")
	}
	if err != nil {
		return nil, "", err
	}
	key, err := DecryptAPIKey(userID, selected.Provider, encrypted)
	if err != nil {
		return nil, "", err
	}
	models, err := ValidateProviderKey(ctx, selected.Provider, key, nil)
	if err != nil {
		if validation, ok := err.(*ValidationError); ok && (validation.Rejected || validation.Incompatible) {
			_ = s.MarkInvalid(ctx, userID, selected.Provider)
		}
		return nil, "", err
	}
	for _, model := range models {
		if model.Model == selected.Model {
			return selected, key, nil
		}
	}
	return nil, "", errors.New("the selected AI model is no longer available")
}

// CredentialForGeneration resolves a previously validated provider selection
// without performing slow model-catalog discovery on every generation request.
// When the user toggled BYOK off, it reports no credential so generation falls
// back to point-funded SlideSage OpenRouter while keys remain stored.
func (s ConnectionService) CredentialForGeneration(ctx context.Context, userID string, requested *Selection) (*Selection, string, error) {
	preference, err := s.GetPreference(ctx, userID)
	if err != nil {
		return nil, "", err
	}
	if !preference.UseByok {
		return nil, "", nil
	}
	selected := requested
	if selected == nil {
		selected = preference.Selection
	}
	if selected == nil {
		return nil, "", nil
	}
	if selected.Provider != OpenAI && selected.Provider != Google && selected.Provider != Anthropic || normalizeModelID(selected.Model) == "" {
		return nil, "", errors.New("invalid AI model selection")
	}
	var encrypted EncryptedCredential
	var status string
	err := s.DB.QueryRowContext(ctx, `SELECT encrypted_api_key, encryption_iv, encryption_key_version, key_last_four, status FROM ai_provider_connections WHERE user_id = $1 AND provider = $2`, userID, selected.Provider).Scan(&encrypted.EncryptedAPIKey, &encrypted.EncryptionIV, &encrypted.EncryptionKeyVersion, &encrypted.KeyLastFour, &status)
	if errors.Is(err, sql.ErrNoRows) || status != "valid" {
		return nil, "", errors.New("the selected AI provider is not connected")
	}
	if err != nil {
		return nil, "", err
	}
	key, err := DecryptAPIKey(userID, selected.Provider, encrypted)
	if err != nil {
		return nil, "", err
	}
	return selected, key, nil
}

func (s ConnectionService) requireEligibility(ctx context.Context, userID string) error {
	var balanceMillis int64
	err := s.DB.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1`, userID).Scan(&balanceMillis)
	if errors.Is(err, sql.ErrNoRows) {
		return errors.New("user not found")
	}
	if err != nil {
		return err
	}
	if balanceMillis <= 50000 {
		return errors.New("provider connections require more than 50 points")
	}
	return nil
}

func (s ConnectionService) upsert(ctx context.Context, userID string, provider Provider, key EncryptedCredential) (Connection, error) {
	row := s.DB.QueryRowContext(ctx, `INSERT INTO ai_provider_connections (id, user_id, provider, encrypted_api_key, encryption_iv, encryption_key_version, key_last_four, status, validated_at) VALUES (md5(random()::text || clock_timestamp()::text), $1, $2, $3, $4, $5, $6, 'valid', NOW()) ON CONFLICT (user_id, provider) DO UPDATE SET encrypted_api_key = EXCLUDED.encrypted_api_key, encryption_iv = EXCLUDED.encryption_iv, encryption_key_version = EXCLUDED.encryption_key_version, key_last_four = EXCLUDED.key_last_four, status = 'valid', validated_at = NOW(), updated_at = NOW() RETURNING user_id, provider, encrypted_api_key, encryption_iv, encryption_key_version, key_last_four, status, validated_at, last_used_at`, userID, provider, key.EncryptedAPIKey, key.EncryptionIV, key.EncryptionKeyVersion, key.KeyLastFour)
	return scanConnection(row)
}

type scanner interface{ Scan(...any) error }

func scanConnection(row scanner) (Connection, error) {
	var connection Connection
	var last sql.NullTime
	err := row.Scan(&connection.UserID, &connection.Provider, &connection.EncryptedAPIKey, &connection.EncryptionIV, &connection.EncryptionKeyVersion, &connection.KeyLastFour, &connection.Status, &connection.ValidatedAt, &last)
	if err != nil {
		return Connection{}, fmt.Errorf("scan AI connection: %w", err)
	}
	if last.Valid {
		connection.LastUsedAt = &last.Time
	}
	return connection, nil
}
