// Package generation implements direct, persisted presentation generation routes.
package generation

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/ai"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/observability"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
)

const (
	maxBodyBytes        = 256 * 1024
	providerMaxAttempts = 4
	providerInitialWait = 2 * time.Second
	providerMaximumWait = 15 * time.Second
)

type Identity func(context.Context, *http.Request) (string, error)

// RouteConfig controls long-lived generation event streams and synchronous research previews.
type RouteConfig struct {
	StreamContext     context.Context
	MaxStreams        int
	MaxStreamsPerUser int
	Research          *presentation.ExaResearchService
}

// RegisterRoutes installs durable generation submission and event endpoints.
func RegisterRoutes(mux *http.ServeMux, database *sql.DB, identity Identity, connections ai.ConnectionService, config RouteConfig) {
	if mux == nil || database == nil || identity == nil {
		panic("generation routes require mux, database, and identity callback")
	}
	if config.StreamContext == nil {
		config.StreamContext = context.Background()
	}
	if config.MaxStreams < 1 {
		config.MaxStreams = positiveEnvInt("GENERATION_STREAM_LIMIT", 40)
	}
	if config.MaxStreamsPerUser < 1 {
		config.MaxStreamsPerUser = positiveEnvInt("GENERATION_STREAM_LIMIT_PER_USER", 3)
	}
	queue, err := newInsertClient(database)
	if err != nil {
		panic(fmt.Sprintf("create generation queue client: %v", err))
	}
	handler := &handler{
		database:      database,
		identity:      identity,
		connections:   connections,
		client:        &http.Client{Timeout: 3 * time.Minute, Transport: observability.HTTPTransport(nil)},
		queue:         queue,
		streamContext: config.StreamContext,
		streams:       newStreamLimiter(config.MaxStreams, config.MaxStreamsPerUser),
		research:      config.Research,
	}
	mux.HandleFunc("POST /presentation-jobs", handler.submit)
	mux.HandleFunc("GET /generation-jobs/{id}", handler.jobStatus)
	mux.HandleFunc("GET /generation-jobs/{id}/events", handler.jobEvents)
	mux.HandleFunc("POST /generation-jobs/{id}/cancel", handler.cancelJob)
}

// RecoverExpired finalizes abandoned authorizations even when their user does not submit another request. It is safe to call concurrently from API nodes.
func RecoverExpired(ctx context.Context, database *sql.DB) error {
	rows, err := database.QueryContext(ctx, `SELECT operation.user_id FROM generation_point_operations operation WHERE operation.status = 'reserved' AND operation.expires_at <= NOW() AND NOT EXISTS (SELECT 1 FROM generation_jobs job WHERE job.operation_id = operation.id AND job.status IN ('queued', 'running', 'retrying')) GROUP BY operation.user_id ORDER BY MIN(operation.expires_at) LIMIT 100`)
	if err != nil {
		return err
	}
	userIDs := []string{}
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			_ = rows.Close()
			return err
		}
		userIDs = append(userIDs, userID)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	recoveryHandler := &handler{database: database}
	return runBounded(ctx, 2, userIDs, func(ctx context.Context, userID string) error {
		return recoveryHandler.recoverExpired(ctx, userID)
	})
}

type handler struct {
	database      *sql.DB
	identity      Identity
	client        *http.Client
	connections   ai.ConnectionService
	queue         *queueClient
	streamContext context.Context
	streams       *streamLimiter
	research      *presentation.ExaResearchService
	sleep         func(context.Context, time.Duration) error
}

func (h *handler) body(writer http.ResponseWriter, request *http.Request, maximum int64) (string, map[string]any, bool) {
	userID, err := h.identity(request.Context(), request)
	if err != nil || strings.TrimSpace(userID) == "" {
		writeError(writer, http.StatusUnauthorized, "Authentication required")
		return "", nil, false
	}
	if request.ContentLength > maximum {
		writeError(writer, http.StatusRequestEntityTooLarge, "Request body is too large")
		return "", nil, false
	}
	raw, err := io.ReadAll(io.LimitReader(request.Body, maximum+1))
	if err != nil || int64(len(raw)) > maximum {
		writeError(writer, http.StatusRequestEntityTooLarge, "Request body is too large")
		return "", nil, false
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	var body map[string]any
	if decoder.Decode(&body) != nil || body == nil {
		writeError(writer, http.StatusBadRequest, "Invalid JSON body")
		return "", nil, false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		writeError(writer, http.StatusBadRequest, "Invalid JSON body")
		return "", nil, false
	}
	return userID, body, true
}

func (h *handler) ownedPresentation(ctx context.Context, id, userID string) (persistedPresentation, error) {
	var item persistedPresentation
	err := h.database.QueryRowContext(ctx, `SELECT id, title, prompt, slides_data, revision FROM presentations WHERE id = $1 AND user_id = $2`, id, userID).Scan(&item.ID, &item.Title, &item.Prompt, &item.Data, &item.Revision)
	return item, err
}

func positiveEnvInt(name string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(name)))
	if err != nil || value < 1 {
		return fallback
	}
	return value
}
