package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/auth"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/generation"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/ai"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/billing"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/middleware"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	if os.Getenv("NODE_ENV") == "production" && strings.TrimSpace(os.Getenv("RATE_LIMIT_HASH_SECRET")) == "" {
		log.Fatal("RATE_LIMIT_HASH_SECRET is required in production")
	}
	database, err := sql.Open("pgx", env("DATABASE_URL", "postgresql://slidesage:slidesage@localhost:5432/slidesage"))
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	database.SetMaxOpenConns(envInt("DATABASE_POOL_MAX", 5))
	database.SetMaxIdleConns(envInt("DATABASE_POOL_MAX", 5))
	database.SetConnMaxIdleTime(time.Duration(envInt("DATABASE_IDLE_TIMEOUT", 20)) * time.Second)
	pingContext, cancelPing := context.WithTimeout(context.Background(), time.Duration(envInt("DATABASE_CONNECT_TIMEOUT", 10))*time.Second)
	defer cancelPing()
	if err := database.PingContext(pingContext); err != nil {
		log.Fatal(err)
	}

	baseURL := env("BASE_URL", "http://localhost:8000")
	secureCookies := strings.HasPrefix(baseURL, "https://")
	cookieName := "better-auth.session_token"
	sameSite := http.SameSiteLaxMode
	if secureCookies {
		cookieName, sameSite = "__Secure-better-auth.session_token", http.SameSiteNoneMode
	}
	service, err := auth.NewService(auth.Config{
		Database:       database,
		AuthSecret:     env("AUTH_SECRET", "slidesage-local-development-secret"),
		CookieName:     cookieName,
		SecureCookies:  secureCookies,
		SameSite:       sameSite,
		BaseURL:        baseURL,
		TrustedOrigins: splitList(env("BETTER_AUTH_TRUSTED_ORIGINS", env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"))),
		EmailSender: auth.ResendEmailSender{
			APIKey: os.Getenv("RESEND_API_KEY"),
			From:   os.Getenv("RESEND_FROM_EMAIL"),
		},
	})
	if err != nil {
		log.Fatal(err)
	}
	cleanupContext, cancelCleanup := context.WithCancel(context.Background())
	defer cancelCleanup()
	go cleanupUnverifiedUsers(cleanupContext, service)
	go recoverPointOperations(cleanupContext, database)

	mux := http.NewServeMux()
	auth.RegisterAuthRoutes(mux, service)
	auth.RegisterProfileRoutes(mux, service)
	identity := service.AuthenticatedUserID
	presentation.RegisterRoutes(mux, presentation.NewService(presentation.NewRepository(database)), func(_ context.Context, request *http.Request) (string, error) {
		return identity(request)
	}, presentation.NewExaResearchService(os.Getenv("EXA_API_KEY"), nil), database)
	ai.RegisterRoutes(mux, ai.ConnectionService{DB: database}, identity)
	var razorpay *billing.RazorpayClient
	if os.Getenv("RAZORPAY_KEY_ID") != "" && os.Getenv("RAZORPAY_KEY_SECRET") != "" {
		razorpay, err = billing.NewRazorpayClientFromEnv()
		if err != nil {
			log.Fatal(err)
		}
	}
	billing.RegisterRoutes(mux, billing.PaymentService{DB: database}, razorpay, identity)
	generation.RegisterRoutes(mux, database, func(_ context.Context, request *http.Request) (string, error) {
		return identity(request)
	}, ai.ConnectionService{DB: database})
	mux.HandleFunc("GET /health", healthHandler)
	mux.HandleFunc("/", notFoundHandler)

	address := net.JoinHostPort(env("HOST", "0.0.0.0"), env("PORT", "8000"))
	server := &http.Server{
		Addr:              address,
		Handler:           withRecovery(withSecurity(middleware.RateLimit(database, env("RATE_LIMIT_HASH_SECRET", env("AUTH_SECRET", "development")), identity, mux))),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-stop
		context, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_ = server.Shutdown(context)
	}()

	log.Printf("api listening on %s", server.Addr)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func cleanupUnverifiedUsers(ctx context.Context, service *auth.Service) {
	cleanup := func() {
		deleted, err := service.CleanupExpiredUnverifiedUsers(ctx)
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				log.Printf("unverified account cleanup failed: %v", err)
			}
			return
		}
		if deleted > 0 {
			log.Printf("deleted %d expired unverified accounts", deleted)
		}
	}

	cleanup()
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cleanup()
		}
	}
}

func recoverPointOperations(ctx context.Context, database *sql.DB) {
	recover := func() {
		if err := generation.RecoverExpired(ctx, database); err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("point operation recovery failed: %v", err)
		}
	}
	recover()
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			recover()
		}
	}
}

func healthHandler(writer http.ResponseWriter, _ *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(`{"status":"ok","timestamp":"` + time.Now().UTC().Format(time.RFC3339Nano) + `"}`))
}

func notFoundHandler(writer http.ResponseWriter, _ *http.Request) {
	writeJSONError(writer, http.StatusNotFound, "Resource not found")
}

func withSecurity(next http.Handler) http.Handler {
	allowed := map[string]bool{}
	defaults := "http://localhost:5173,http://127.0.0.1:5173,https://slidesage.pages.dev,https://slidesage.app,https://www.slidesage.app"
	for _, origin := range strings.Split(env("CORS_ORIGINS", env("CORS_ORIGIN", defaults)), ",") {
		allowed[strings.TrimSpace(origin)] = true
	}
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		origin := request.Header.Get("Origin")
		writer.Header().Add("Vary", "Origin")
		if allowed[origin] {
			writer.Header().Set("Access-Control-Allow-Origin", origin)
			writer.Header().Set("Access-Control-Allow-Credentials", "true")
			writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key")
			writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			writer.Header().Set("Access-Control-Max-Age", "86400")
		}
		if request.Method == http.MethodOptions {
			if origin != "" && !allowed[origin] {
				writeJSONError(writer, http.StatusForbidden, "Origin is not allowed")
				return
			}
			writer.WriteHeader(http.StatusNoContent)
			return
		}
		unsafe := request.Method == http.MethodPost || request.Method == http.MethodPut || request.Method == http.MethodPatch || request.Method == http.MethodDelete
		webhook := request.URL.Path == "/billing/webhook"
		if unsafe && !webhook && (origin != "" && !allowed[origin] || origin == "" && request.Header.Get("Sec-Fetch-Site") == "cross-site") {
			writeJSONError(writer, http.StatusForbidden, "Origin is not allowed")
			return
		}
		request.Body = http.MaxBytesReader(writer, request.Body, 1<<20)
		next.ServeHTTP(writer, request)
	})
}

func withRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				log.Printf("panic serving %s %s: %v", request.Method, request.URL.Path, recovered)
				writeJSONError(writer, http.StatusInternalServerError, "Internal server error")
			}
		}()
		next.ServeHTTP(writer, request)
	})
}

func env(name string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func envInt(name string, fallback int) int {
	value, err := strconv.Atoi(env(name, strconv.Itoa(fallback)))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
func splitList(value string) []string {
	values := []string{}
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			values = append(values, item)
		}
	}
	return values
}

func writeJSONError(writer http.ResponseWriter, status int, message string) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]string{"message": message}})
}
