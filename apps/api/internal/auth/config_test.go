package auth

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestConfigUsesUnverifiedAccountRetention(t *testing.T) {
	config := (Config{}).normalized()
	if config.UnverifiedTTL != 24*time.Hour {
		t.Fatalf("expected a 24 hour unverified account TTL, got %s", config.UnverifiedTTL)
	}

	configuredTTL := 48 * time.Hour
	config = (Config{UnverifiedTTL: configuredTTL}).normalized()
	if config.UnverifiedTTL != configuredTTL {
		t.Fatalf("expected configured unverified account TTL %s, got %s", configuredTTL, config.UnverifiedTTL)
	}
}

func TestResendEmailSenderPreservesProviderValidationDetails(t *testing.T) {
	sender := ResendEmailSender{
		APIKey: "test-key",
		From:   "SlideSage <auth@example.com>",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusUnprocessableEntity,
				Body: io.NopCloser(strings.NewReader(
					`{"name":"invalid_from_address","message":"Invalid from field."}`,
				)),
				Header: make(http.Header),
			}, nil
		})},
	}

	err := sender.SendOTP(context.Background(), "user@example.com", "123456", "email-verification", "User")
	if !errors.Is(err, ErrEmailDelivery) {
		t.Fatalf("expected email delivery error, got %v", err)
	}
	if !strings.Contains(err.Error(), "invalid_from_address: Invalid from field.") {
		t.Fatalf("expected provider validation detail, got %v", err)
	}
}

func TestResendEmailSenderRejectsInvalidFromAddress(t *testing.T) {
	sender := ResendEmailSender{APIKey: "test-key", From: "invalid sender"}
	err := sender.SendOTP(context.Background(), "user@example.com", "123456", "email-verification", "User")
	if !errors.Is(err, ErrEmailDelivery) || !strings.Contains(err.Error(), "RESEND_FROM_EMAIL is invalid") {
		t.Fatalf("expected invalid sender error, got %v", err)
	}
}

func TestResendEmailSenderAcceptsDotenvQuotedFromAddress(t *testing.T) {
	sender := ResendEmailSender{
		APIKey: "test-key",
		From:   `"SlideSage <auth@example.com>"`,
		HTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			var body map[string]string
			if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
				t.Fatalf("decode request: %v", err)
			}
			if body["from"] != "SlideSage <auth@example.com>" {
				t.Fatalf("unexpected sender: %q", body["from"])
			}
			return &http.Response{
				StatusCode: http.StatusOK,
				Body:       io.NopCloser(strings.NewReader(`{"id":"email-id"}`)),
				Header:     make(http.Header),
			}, nil
		})},
	}

	if err := sender.SendOTP(context.Background(), "user@example.com", "123456", "email-verification", "User"); err != nil {
		t.Fatalf("expected quoted sender to be normalized, got %v", err)
	}
}

func TestResendEmailSenderStopsWhenContextIsCancelled(t *testing.T) {
	started := make(chan struct{})
	sender := ResendEmailSender{
		APIKey: "test-key",
		From:   "auth@example.com",
		HTTPClient: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			close(started)
			<-request.Context().Done()
			return nil, request.Context().Err()
		})},
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- sender.SendOTP(ctx, "user@example.com", "123456", "email-verification", "User")
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("email request did not start")
	}
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancelled email request succeeded")
		}
	case <-time.After(time.Second):
		t.Fatal("email request ignored context cancellation")
	}
}
