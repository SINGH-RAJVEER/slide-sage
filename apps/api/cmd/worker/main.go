package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync/atomic"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/auth"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/generation"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/ai"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/middleware"
)

func main() {
	database, err := sql.Open("pgx", env("DATABASE_URL", "postgresql://slidesage:slidesage@localhost:5432/slidesage"))
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	maxWorkers := envInt("WORKER_CONCURRENCY", 2)
	database.SetMaxOpenConns(envInt("WORKER_DATABASE_POOL_MAX", maxWorkers+3))
	database.SetMaxIdleConns(envInt("WORKER_DATABASE_POOL_MAX", maxWorkers+3))
	database.SetConnMaxIdleTime(time.Duration(envInt("DATABASE_IDLE_TIMEOUT", 20)) * time.Second)

	signalContext, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pingContext, cancelPing := context.WithTimeout(signalContext, time.Duration(envInt("DATABASE_CONNECT_TIMEOUT", 10))*time.Second)
	defer cancelPing()
	if err := database.PingContext(pingContext); err != nil {
		log.Fatal(err)
	}

	client, err := generation.NewWorkerClient(database, ai.ConnectionService{DB: database}, maxWorkers)
	if err != nil {
		log.Fatal(err)
	}
	workerContext, cancelWorker := context.WithCancel(context.Background())
	defer cancelWorker()
	if err := client.Start(workerContext); err != nil {
		log.Fatal(err)
	}
	authService, err := auth.NewService(auth.Config{Database: database})
	if err != nil {
		log.Fatal(err)
	}
	ready := &atomic.Bool{}
	healthServer, healthErrors, err := startHealthServer(database, ready)
	if err != nil {
		log.Fatal(err)
	}
	maintenanceContext, cancelMaintenance := context.WithCancel(context.Background())
	maintenanceDone := make(chan struct{})
	go func() {
		defer close(maintenanceDone)
		runMaintenance(maintenanceContext, database, authService)
	}()
	ready.Store(true)
	log.Printf("generation worker started with concurrency %d", maxWorkers)
	select {
	case <-signalContext.Done():
	case err := <-healthErrors:
		if err != nil {
			log.Printf("worker health server failed: %v", err)
		}
	}

	ready.Store(false)
	cancelMaintenance()
	select {
	case <-maintenanceDone:
	case <-time.After(500 * time.Millisecond):
		log.Printf("worker maintenance did not stop within 500 milliseconds")
	}
	healthDone := make(chan error, 1)
	go func() {
		healthContext, cancelHealth := context.WithTimeout(context.Background(), time.Second)
		defer cancelHealth()
		healthDone <- healthServer.Shutdown(healthContext)
	}()
	drainContext, cancelDrain := context.WithTimeout(context.Background(), time.Duration(envInt("WORKER_DRAIN_TIMEOUT", 8))*time.Second)
	stopErr := client.Stop(drainContext)
	cancelDrain()
	if stopErr != nil {
		log.Printf("generation worker graceful shutdown failed: %v", stopErr)
		cancelWorker()
		forceContext, cancelForce := context.WithTimeout(context.Background(), time.Second)
		if err := client.StopAndCancel(forceContext); err != nil {
			log.Printf("generation worker forced shutdown failed: %v", err)
		}
		cancelForce()
	}
	cancelWorker()
	if err := <-healthDone; err != nil {
		log.Printf("worker health shutdown failed: %v", err)
	}
}

func startHealthServer(database *sql.DB, ready *atomic.Bool) (*http.Server, <-chan error, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /live", func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /ready", func(writer http.ResponseWriter, request *http.Request) {
		if !ready.Load() {
			http.Error(writer, "worker is not ready", http.StatusServiceUnavailable)
			return
		}
		ctx, cancel := context.WithTimeout(request.Context(), time.Second)
		defer cancel()
		if err := database.PingContext(ctx); err != nil {
			http.Error(writer, "database unavailable", http.StatusServiceUnavailable)
			return
		}
		writer.WriteHeader(http.StatusNoContent)
	})
	server := &http.Server{
		Addr:              net.JoinHostPort("0.0.0.0", env("WORKER_HEALTH_PORT", "8080")),
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		return nil, nil, err
	}
	errorChannel := make(chan error, 1)
	go func() {
		err := server.Serve(listener)
		if errors.Is(err, http.ErrServerClosed) {
			err = nil
		}
		errorChannel <- err
	}()
	return server, errorChannel, nil
}

func runMaintenance(ctx context.Context, database *sql.DB, authService *auth.Service) {
	recoveryTicker := time.NewTicker(time.Minute)
	cleanupTicker := time.NewTicker(time.Hour)
	defer recoveryTicker.Stop()
	defer cleanupTicker.Stop()
	runRecovery(ctx, database)
	runCleanup(ctx, database, authService)
	for {
		select {
		case <-ctx.Done():
			return
		case <-recoveryTicker.C:
			runRecovery(ctx, database)
		case <-cleanupTicker.C:
			runCleanup(ctx, database, authService)
		}
	}
}

func runRecovery(ctx context.Context, database *sql.DB) {
	if err := generation.RecoverTerminatedQueueJobs(ctx, database); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("terminated generation recovery failed: %v", err)
	}
	if err := generation.RecoverExpired(ctx, database); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("expired generation recovery failed: %v", err)
	}
}

func runCleanup(ctx context.Context, database *sql.DB, authService *auth.Service) {
	if deleted, err := authService.CleanupExpiredUnverifiedUsers(ctx); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("unverified account cleanup failed: %v", err)
	} else if deleted > 0 {
		log.Printf("deleted %d expired unverified accounts", deleted)
	}
	if deleted, err := middleware.CleanupExpired(ctx, database, 500); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("rate-limit cleanup failed: %v", err)
	} else if deleted > 0 {
		log.Printf("deleted %d expired rate-limit counters", deleted)
	}
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(key))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}
