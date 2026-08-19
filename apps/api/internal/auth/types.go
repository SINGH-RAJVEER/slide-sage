package auth

import (
	"context"
	"time"
)

type User struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	Email         string    `json:"email"`
	EmailVerified bool      `json:"emailVerified"`
	Image         *string   `json:"image"`
	SlideTokens   float64   `json:"slideTokens"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type JWTAuth struct {
	ID        string
	Token     string
	UserID    string
	ExpiresAt time.Time
}

type Verification struct {
	ID         string
	Identifier string
	Value      string
	ExpiresAt  time.Time
	CreatedAt  time.Time
}

type EmailSender interface {
	SendOTP(ctx context.Context, email, code, purpose, name string) error
}
