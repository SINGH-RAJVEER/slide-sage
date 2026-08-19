package auth

import (
	"database/sql"
	"testing"
	"time"
)

func TestJWTGenerationAndVerification(t *testing.T) {
	config := Config{
		Database:   &sql.DB{},
		AuthSecret: "test-secret-key-that-is-at-least-32-bytes-long",
		JWTTTL:     1 * time.Hour,
		Now:        time.Now,
	}.normalized()

	service := &Service{config: config}

	userID := "user-123"
	email := "test@example.com"

	token, err := service.GenerateJWT(userID, email, 1*time.Hour)
	if err != nil {
		t.Fatalf("failed to generate JWT: %v", err)
	}

	sub, err := service.VerifyJWT(token)
	if err != nil {
		t.Fatalf("failed to verify JWT: %v", err)
	}

	if sub != userID {
		t.Fatalf("expected subject %s, got %s", userID, sub)
	}
}

func TestJWTExpiration(t *testing.T) {
	now := time.Now()
	config := Config{
		Database:   &sql.DB{},
		AuthSecret: "test-secret-key-that-is-at-least-32-bytes-long",
		JWTTTL:     -1 * time.Hour, // already expired
		Now:        func() time.Time { return now },
	}.normalized()

	service := &Service{config: config}

	token, err := service.GenerateJWT("user-123", "test@example.com", -1*time.Hour)
	if err != nil {
		t.Fatalf("failed to generate JWT: %v", err)
	}

	_, err = service.VerifyJWT(token)
	if err == nil {
		t.Fatalf("expected error verifying expired token, got nil")
	}
}
