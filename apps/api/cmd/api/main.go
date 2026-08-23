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
	cookieName := "slidesage_token"
	sameSite := http.SameSiteLaxMode
	if secureCookies {
		cookieName, sameSite = "__Secure-slidesage_token", http.SameSiteNoneMode
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
	mux := http.NewServeMux()
	auth.RegisterAuthRoutes(mux, service)
	auth.RegisterProfileRoutes(mux, service)
	identity := service.AuthenticatedUserID
	researchService := presentation.NewExaResearchService(os.Getenv("EXA_API_KEY"), nil)
	presentation.RegisterRoutes(mux, presentation.NewService(presentation.NewRepository(database)), func(_ context.Context, request *http.Request) (string, error) {
		return identity(request)
	}, researchService, database)
	ai.RegisterRoutes(mux, ai.ConnectionService{DB: database}, identity)
	var razorpay *billing.RazorpayClient
	if os.Getenv("RAZORPAY_KEY_ID") != "" && os.Getenv("RAZORPAY_KEY_SECRET") != "" {
		razorpay, err = billing.NewRazorpayClientFromEnv()
		if err != nil {
			log.Fatal(err)
		}
	}
	billing.RegisterRoutes(mux, billing.PaymentService{DB: database}, razorpay, identity)
	streamContext, cancelStreams := context.WithCancel(context.Background())
	defer cancelStreams()
	generation.RegisterRoutes(mux, database, func(_ context.Context, request *http.Request) (string, error) {
		return identity(request)
	}, ai.ConnectionService{DB: database}, generation.RouteConfig{StreamContext: streamContext, Research: researchService})
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

	signalContext, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()
	serveErrors := make(chan error, 1)
	go func() {
		err := server.ListenAndServe()
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		serveErrors <- err
	}()

	log.Printf("api listening on %s", server.Addr)
	select {
	case <-signalContext.Done():
	case err := <-serveErrors:
		if err != nil {
			log.Fatal(err)
		}
		return
	}

	cancelStreams()
	shutdownContext, cancelShutdown := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancelShutdown()
	if err := server.Shutdown(shutdownContext); err != nil {
		log.Printf("api shutdown failed: %v", err)
		_ = server.Close()
	}
	if err := <-serveErrors; err != nil {
		log.Printf("api server failed: %v", err)
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
			writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, Last-Event-ID")
			writer.Header().Set("Access-Control-Expose-Headers", "X-Generation-Job-ID, X-Presentation-ID")
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
