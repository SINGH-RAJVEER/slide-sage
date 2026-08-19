package auth

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"
)

const developmentAuthSecret = "slidesage-local-development-secret"

type Config struct {
	Database       *sql.DB
	AuthSecret     string
	CookieName     string
	JWTTTL         time.Duration
	UnverifiedTTL  time.Duration
	SecureCookies  bool
	SameSite       http.SameSite
	EmailSender    EmailSender
	Now            func() time.Time
	BaseURL        string
	TrustedOrigins []string
	HTTPClient     *http.Client
}

type ResendEmailSender struct {
	APIKey     string
	From       string
	HTTPClient *http.Client
}

func (sender ResendEmailSender) SendOTP(ctx context.Context, email, code, purpose, name string) error {
	if strings.TrimSpace(sender.APIKey) == "" {
		return fmt.Errorf("%w: email service is not configured", ErrEmailDelivery)
	}
	subject := "Verify your Slide Sage email"
	if purpose == "forget-password" {
		subject = "Reset your Slide Sage password"
	} else if purpose == "sign-in" {
		subject = "Your Slide Sage sign-in code"
	}
	from := strings.TrimSpace(sender.From)
	if from == "" {
		from = "onboarding@resend.dev"
	}
	if len(from) >= 2 && ((from[0] == '"' && from[len(from)-1] == '"') || (from[0] == '\'' && from[len(from)-1] == '\'')) {
		from = strings.TrimSpace(from[1 : len(from)-1])
	}
	if _, err := mail.ParseAddress(from); err != nil {
		return fmt.Errorf("%w: RESEND_FROM_EMAIL is invalid", ErrEmailDelivery)
	}
	payload, err := json.Marshal(map[string]string{
		"from":    from,
		"to":      email,
		"subject": subject,
		"html":    fmt.Sprintf("<p>Hello %s,</p><p>Your Slide Sage verification code is <strong>%s</strong>.</p><p>This code expires in 15 minutes.</p>", htmlEscape(name), code),
	})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+sender.APIKey)
	request.Header.Set("Content-Type", "application/json")
	client := sender.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrEmailDelivery, err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		var providerError struct {
			Name    string `json:"name"`
			Message string `json:"message"`
		}
		_ = json.NewDecoder(io.LimitReader(response.Body, 64*1024)).Decode(&providerError)
		detail := strings.TrimSpace(providerError.Message)
		if providerError.Name != "" {
			detail = providerError.Name + ": " + detail
		}
		if detail == "" {
			detail = http.StatusText(response.StatusCode)
		}
		return fmt.Errorf("%w: resend returned %d (%s)", ErrEmailDelivery, response.StatusCode, detail)
	}
	return nil
}

func htmlEscape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&#39;")
	return replacer.Replace(value)
}

func (config Config) normalized() Config {
	config.AuthSecret = strings.TrimSpace(config.AuthSecret)
	if config.AuthSecret == "" {
		config.AuthSecret = developmentAuthSecret
	}
	if config.CookieName == "" {
		config.CookieName = "slidesage_token"
	}
	if config.JWTTTL <= 0 {
		config.JWTTTL = 7 * 24 * time.Hour
	}
	if config.UnverifiedTTL <= 0 {
		config.UnverifiedTTL = 24 * time.Hour
	}
	if config.SameSite == 0 {
		config.SameSite = http.SameSiteLaxMode
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	config.BaseURL = strings.TrimRight(strings.TrimSpace(config.BaseURL), "/")
	if config.BaseURL == "" {
		config.BaseURL = "http://localhost:8000"
	}
	if config.HTTPClient == nil {
		config.HTTPClient = &http.Client{Timeout: 15 * time.Second}
	}
	return config
}
