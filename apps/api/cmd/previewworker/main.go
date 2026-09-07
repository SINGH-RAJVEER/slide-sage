// Command previewworker renders committed PPTX revisions into slide images.
//
// It runs apart from the generation worker because headless LibreOffice needs a
// full operating-system image, and because a slow render must never delay a
// deck that is already downloadable.
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

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/slidepreview"
)

func main() {
	bucket := os.Getenv("PRESENTATION_GCS_BUCKET")
	if bucket == "" {
		log.Fatal("PRESENTATION_GCS_BUCKET is required")
	}
	database, err := sql.Open("pgx", env("DATABASE_URL", "postgresql://slidesage:slidesage@localhost:5432/slidesage"))
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()
	maxWorkers := envInt("PREVIEW_CONCURRENCY", 1)
	database.SetMaxOpenConns(envInt("PREVIEW_DATABASE_POOL_MAX", maxWorkers+2))
	database.SetMaxIdleConns(envInt("PREVIEW_DATABASE_POOL_MAX", maxWorkers+2))
	database.SetConnMaxIdleTime(time.Duration(envInt("DATABASE_IDLE_TIMEOUT", 20)) * time.Second)

	signalContext, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pingContext, cancelPing := context.WithTimeout(signalContext, time.Duration(envInt("DATABASE_CONNECT_TIMEOUT", 10))*time.Second)
	defer cancelPing()
	if err := database.PingContext(pingContext); err != nil {
		log.Fatal(err)
	}

	objects, err := presentationrevision.NewGCSBlobStore(context.Background(), bucket)
	if err != nil {
		log.Fatal(err)
	}
	defer objects.Close()

	service, err := slidepreview.NewService(slidepreview.Config{
		Revisions: presentationrevision.NewPostgresRepository(database),
		Objects:   objects,
		Renderer: slidepreview.NewLibreOfficeRenderer(slidepreview.LibreOfficeConfig{
			SofficePath:  os.Getenv("SOFFICE_PATH"),
			PDFToPPMPath: os.Getenv("PDFTOPPM_PATH"),
			CWebPPath:    os.Getenv("CWEBP_PATH"),
			Quality:      envInt("PREVIEW_WEBP_QUALITY", 0),
			TempDir:      os.Getenv("PREVIEW_TEMP_DIR"),
		}),
		Limits: slidepreview.Limits{
			MaxSlides: envInt("PREVIEW_MAX_SLIDES", 0),
			Width:     envInt("PREVIEW_WIDTH", 0),
			Timeout:   time.Duration(envInt("PREVIEW_TIMEOUT_SECONDS", 0)) * time.Second,
		},
	})
	if err != nil {
		log.Fatal(err)
	}

	client, err := slidepreview.NewWorkerClient(database, service, maxWorkers)
	if err != nil {
		log.Fatal(err)
	}
	workerContext, cancelWorker := context.WithCancel(context.Background())
	defer cancelWorker()
	if err := client.Start(workerContext); err != nil {
		log.Fatal(err)
	}

	ready := &atomic.Bool{}
	healthServer, healthErrors, err := startHealthServer(database, ready)
	if err != nil {
		log.Fatal(err)
	}
	ready.Store(true)
	log.Printf("preview worker started with concurrency %d", maxWorkers)
	select {
	case <-signalContext.Done():
	case err := <-healthErrors:
		if err != nil {
			log.Printf("preview health server failed: %v", err)
		}
	}

	ready.Store(false)
	healthDone := make(chan error, 1)
	go func() {
		healthContext, cancelHealth := context.WithTimeout(context.Background(), time.Second)
		defer cancelHealth()
		healthDone <- healthServer.Shutdown(healthContext)
	}()
	drainContext, cancelDrain := context.WithTimeout(context.Background(), time.Duration(envInt("PREVIEW_DRAIN_TIMEOUT", 8))*time.Second)
	stopErr := client.Stop(drainContext)
	cancelDrain()
	if stopErr != nil {
		log.Printf("preview worker graceful shutdown failed: %v", stopErr)
		cancelWorker()
		forceContext, cancelForce := context.WithTimeout(context.Background(), time.Second)
		if err := client.StopAndCancel(forceContext); err != nil {
			log.Printf("preview worker forced shutdown failed: %v", err)
		}
		cancelForce()
	}
	cancelWorker()
	if err := <-healthDone; err != nil {
		log.Printf("preview health shutdown failed: %v", err)
	}
}

func startHealthServer(database *sql.DB, ready *atomic.Bool) (*http.Server, <-chan error, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /live", func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("GET /ready", func(writer http.ResponseWriter, request *http.Request) {
		if !ready.Load() {
			http.Error(writer, "preview worker is not ready", http.StatusServiceUnavailable)
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
		Addr:              net.JoinHostPort("0.0.0.0", env("PREVIEW_HEALTH_PORT", "8080")),
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
