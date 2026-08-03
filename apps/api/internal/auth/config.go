package auth

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const developmentAuthSecret = "slidesage-local-development-secret"

type Config struct {
	Database       *sql.DB
	AuthSecret     string
	CookieName     string
	SessionTTL     time.Duration
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

func (sender ResendEmailSender) SendOTP(email, code, purpose, name string) error {
	if strings.TrimSpace(sender.APIKey) == "" {
		return errors.New("email service is not configured")
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
	payload, err := json.Marshal(map[string]string{
		"from":    from,
		"to":      email,
		"subject": subject,
		"html":    fmt.Sprintf("<p>Hello %s,</p><p>Your Slide Sage verification code is <strong>%s</strong>.</p><p>This code expires in 15 minutes.</p>", htmlEscape(name), code),
	})
	if err != nil {
		return err
	}
	request, err := http.NewRequest(http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
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
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("email delivery failed with status %d", response.StatusCode)
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
		config.CookieName = "better-auth.session_token"
	}
	if config.SessionTTL <= 0 {
		config.SessionTTL = 7 * 24 * time.Hour
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
