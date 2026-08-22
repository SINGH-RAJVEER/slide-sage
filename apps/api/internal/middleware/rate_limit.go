package middleware

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type Identity func(*http.Request) (string, error)

type ratePolicy struct {
	scope         string
	limit         int
	window        time.Duration
	authenticated bool
}

func RateLimit(database *sql.DB, secret string, identity Identity, next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		policy, ok := policyFor(request.Method, request.URL.Path)
		if !ok || request.Method == http.MethodOptions {
			next.ServeHTTP(writer, request)
			return
		}
		key := clientAddress(request)
		if policy.authenticated {
			userID, err := identity(request)
			if err != nil || strings.TrimSpace(userID) == "" {
				next.ServeHTTP(writer, request)
				return
			}
			key = userID
		}
		now := time.Now().UTC()
		policies := []struct {
			policy ratePolicy
			key    string
		}{{policy, key}}
		if emailPolicy, ok := emailPolicyFor(request.Method, request.URL.Path); ok {
			if email := requestEmail(request); email != "" {
				policies = append(policies, struct {
					policy ratePolicy
					key    string
				}{emailPolicy, email})
			}
		}
		for _, item := range policies {
			itemStart := now.Truncate(item.policy.window)
			itemExpiry := itemStart.Add(item.policy.window)
			count, err := consume(request.Context(), database, item.policy.scope, hashKey(secret, item.policy.scope, item.key), itemStart, itemExpiry)
			if err != nil {
				writeRateError(writer, http.StatusServiceUnavailable, "Request protection is temporarily unavailable", "RATE_LIMIT_UNAVAILABLE", 0)
				return
			}
			if count > item.policy.limit {
				retryAfter := max(1, int(time.Until(itemExpiry).Seconds()+.999))
				writer.Header().Set("Retry-After", strconv.Itoa(retryAfter))
				writeRateError(writer, http.StatusTooManyRequests, "Too many requests", "RATE_LIMITED", retryAfter)
				return
			}
		}
		next.ServeHTTP(writer, request)
	})
}

func emailPolicyFor(method, path string) (ratePolicy, bool) {
	if method != http.MethodPost {
		return ratePolicy{}, false
	}
	switch {
	case strings.HasPrefix(path, "/auth/email-otp/"):
		return ratePolicy{"auth-email-otp-email", 5, time.Hour, false}, true
	case strings.HasPrefix(path, "/auth/sign-in/"):
		return ratePolicy{"auth-sign-in-email", 10, 15 * time.Minute, false}, true
	case strings.HasPrefix(path, "/auth/sign-up/"):
		return ratePolicy{"auth-sign-up-email", 5, time.Hour, false}, true
	default:
		return ratePolicy{}, false
	}
}

func requestEmail(request *http.Request) string {
	body, err := io.ReadAll(io.LimitReader(request.Body, 32*1024+1))
	if err != nil {
		return ""
	}
	request.Body = io.NopCloser(bytes.NewReader(body))
	if len(body) > 32*1024 {
		return ""
	}
	var input struct {
		Email string `json:"email"`
	}
	if json.Unmarshal(body, &input) != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(input.Email))
}

func consume(ctx context.Context, database *sql.DB, scope, keyHash string, windowStart, expiresAt time.Time) (int, error) {
	var count int
	err := database.QueryRowContext(ctx, `INSERT INTO api_rate_limits (scope, key_hash, window_start, request_count, expires_at) VALUES ($1, $2, $3, 1, $4) ON CONFLICT (scope, key_hash, window_start) DO UPDATE SET request_count = api_rate_limits.request_count + 1, expires_at = EXCLUDED.expires_at RETURNING request_count`, scope, keyHash, windowStart, expiresAt).Scan(&count)
	return count, err
}

// CleanupExpired deletes at most limit expired counters without adding cleanup
// work to request transactions.
func CleanupExpired(ctx context.Context, database *sql.DB, limit int) (int64, error) {
	if database == nil {
		return 0, errors.New("rate-limit database is required")
	}
	if limit < 1 {
		limit = 500
	}
	result, err := database.ExecContext(ctx, `DELETE FROM api_rate_limits WHERE ctid IN (SELECT ctid FROM api_rate_limits WHERE expires_at < NOW() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)`, limit)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func policyFor(method, path string) (ratePolicy, bool) {
	minute, tenMinutes, fifteenMinutes, hour := time.Minute, 10*time.Minute, 15*time.Minute, time.Hour
	switch {
	case method == http.MethodPost && strings.HasPrefix(path, "/auth/email-otp/"):
		return ratePolicy{"auth-email-otp-ip", 20, hour, false}, true
	case method == http.MethodPost && strings.HasPrefix(path, "/auth/sign-in/"):
		return ratePolicy{"auth-sign-in-ip", 30, fifteenMinutes, false}, true
	case method == http.MethodPost && strings.HasPrefix(path, "/auth/sign-up/"):
		return ratePolicy{"auth-sign-up-ip", 20, hour, false}, true
	case method == http.MethodPut && path == "/profile" || method == http.MethodPost && path == "/profile/email/verify":
		return ratePolicy{"profile-mutation", 10, fifteenMinutes, true}, true
	case method == http.MethodPost && path == "/ai/connections" || method == http.MethodPut && strings.HasPrefix(path, "/ai/connections/"):
		return ratePolicy{"ai-connection-write", 6, tenMinutes, true}, true
	case (method == http.MethodDelete && strings.HasPrefix(path, "/ai/connections/")) || method == http.MethodPut && path == "/ai/selection":
		return ratePolicy{"ai-selection-write", 20, tenMinutes, true}, true
	case method == http.MethodPost && path == "/presentation-jobs":
		return ratePolicy{"presentation-generation", 15, minute, true}, true
	case method == http.MethodPost && path == "/research-presentation":
		return ratePolicy{"presentation-research", 20, minute, true}, true
	case method == http.MethodPost && path == "/billing/checkout":
		return ratePolicy{"billing-checkout", 10, tenMinutes, true}, true
	case method == http.MethodPost && path == "/billing/verify":
		return ratePolicy{"billing-verify", 20, fifteenMinutes, true}, true
	case method == http.MethodPost && path == "/billing/webhook":
		return ratePolicy{"billing-webhook", 120, minute, false}, true
	default:
		return ratePolicy{}, false
	}
}

func hashKey(secret, scope, key string) string {
	digest := sha256.Sum256([]byte(secret + "\x00" + scope + "\x00" + key))
	return hex.EncodeToString(digest[:])
}

func clientAddress(request *http.Request) string {
	if os.Getenv("TRUST_PROXY_HEADERS") == "true" {
		for _, value := range []string{request.Header.Get("CF-Connecting-IP"), strings.Split(request.Header.Get("X-Forwarded-For"), ",")[0], request.Header.Get("X-Real-IP")} {
			if value = strings.TrimSpace(value); value != "" {
				return truncate(value, 128)
			}
		}
	}
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err == nil {
		return truncate(host, 128)
	}
	return truncate(request.RemoteAddr, 128)
}

func truncate(value string, maximum int) string {
	if len(value) > maximum {
		return value[:maximum]
	}
	return value
}

func writeRateError(writer http.ResponseWriter, status int, message, code string, retryAfter int) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	body := map[string]any{"error": map[string]string{"message": message, "code": code}}
	if retryAfter > 0 {
		body["retry_after"] = retryAfter
	}
	_ = json.NewEncoder(writer).Encode(body)
}
