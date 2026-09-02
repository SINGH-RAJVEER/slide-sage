package generation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/ai"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverdatabasesql"
)

const generationQueue = "generation"

var (
	errGenerationCancelled = errors.New("generation was cancelled")
	errInactiveReservation = errors.New("generation point reservation is not active")
	errInvalidJobPayload   = errors.New("invalid generation job payload")
	errPresentationChanged = errors.New("presentation changed while generation was running")
)

type queueClient = river.Client[*sql.Tx]

// JobArgs is intentionally small so queue internals never become the source of
// truth for user-visible generation state.
type JobArgs struct {
	JobID string `json:"job_id"`
}

func (JobArgs) Kind() string { return "presentation_generation_v1" }

func (JobArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: generationQueue, MaxAttempts: 3}
}

type jobPayload struct {
	UserID           string                          `json:"user_id"`
	OperationID      string                          `json:"operation_id"`
	PresentationID   string                          `json:"presentation_id"`
	Kind             string                          `json:"kind"`
	Prompt           string                          `json:"prompt"`
	SlideCount       int                             `json:"slide_count"`
	DetailLevel      string                          `json:"detail_level"`
	Tonality         string                          `json:"tonality"`
	Research         any                             `json:"research,omitempty"`
	ResearchPayload  *presentation.ResearchPayload   `json:"research_payload,omitempty"`
	Selection        *ai.Selection                   `json:"ai,omitempty"`
	Template         *presentation.TemplateReference `json:"template,omitempty"`
	Current          json.RawMessage                 `json:"current,omitempty"`
	ExpectedRevision int                             `json:"expected_revision"`
	QuotedMillis     int64                           `json:"quoted_millis"`
	RequestHash      string                          `json:"request_hash,omitempty"`
}

func payloadFromJob(job streamJob) jobPayload {
	return jobPayload{
		UserID: job.userID, OperationID: job.operationID, PresentationID: job.presentationID,
		Kind: job.kind, Prompt: job.prompt, SlideCount: job.slideCount,
		DetailLevel: job.detailLevel, Tonality: job.tonality,
		Research: job.research, ResearchPayload: job.researchPayload, Selection: job.selection, Template: job.template,
		Current: job.current, ExpectedRevision: job.expectedRevision, QuotedMillis: job.quote,
		RequestHash: job.requestHash,
	}
}

func (payload jobPayload) streamJob() streamJob {
	return streamJob{
		userID: payload.UserID, operationID: payload.OperationID, presentationID: payload.PresentationID,
		expectedRevision: payload.ExpectedRevision, quote: payload.QuotedMillis,
		prompt: payload.Prompt, slideCount: payload.SlideCount, detailLevel: payload.DetailLevel,
		tonality: payload.Tonality, research: payload.Research,
		researchPayload: payload.ResearchPayload, selection: payload.Selection, template: payload.Template, current: payload.Current,
		kind: payload.Kind, requestHash: payload.RequestHash,
	}
}

type generationJobRecord struct {
	ID              string
	OperationID     string
	UserID          string
	PresentationID  string
	Kind            string
	Status          string
	Payload         jobPayload
	CancelRequested bool
}

func newInsertClient(database *sql.DB) (*queueClient, error) {
	return river.NewClient(riverdatabasesql.New(database), &river.Config{})
}

// NewWorkerClient constructs the continuously running River client used by the
// worker process. API processes use an insert-only client instead.
func NewWorkerClient(database *sql.DB, connections ai.ConnectionService, maxWorkers int) (*queueClient, error) {
	if maxWorkers < 1 {
		maxWorkers = 1
	}
	workers := river.NewWorkers()
	river.AddWorker(workers, &generationWorker{
		handler: &handler{
			database:    database,
			client:      &http.Client{Timeout: 3 * time.Minute},
			connections: connections,
		},
	})
	return river.NewClient(riverdatabasesql.New(database), &river.Config{
		FetchPollInterval:    time.Second,
		JobTimeout:           7 * time.Minute,
		RescueStuckJobsAfter: 8 * time.Minute,
		SoftStopTimeout:      6 * time.Second,
		Queues: map[string]river.QueueConfig{
			generationQueue: {MaxWorkers: maxWorkers},
		},
		Workers: workers,
	})
}

// RecoverTerminatedQueueJobs refunds domain jobs that River permanently
// discarded or cancelled outside the normal processor finalization path.
func RecoverTerminatedQueueJobs(ctx context.Context, database *sql.DB) error {
	rows, err := database.QueryContext(ctx, `SELECT job.id FROM generation_jobs job JOIN river_job queue_job ON queue_job.id = job.river_job_id WHERE job.status IN ('queued', 'running', 'retrying') AND queue_job.state IN ('cancelled', 'discarded') ORDER BY job.updated_at LIMIT 100`)
	if err != nil {
		return err
	}
	jobIDs := []string{}
	for rows.Next() {
		var jobID string
		if err := rows.Scan(&jobID); err != nil {
			return err
		}
		jobIDs = append(jobIDs, jobID)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	return runBounded(ctx, 2, jobIDs, func(ctx context.Context, jobID string) error {
		if err := recoverTerminatedQueueJob(ctx, database, jobID); err != nil {
			return fmt.Errorf("recover generation job %s: %w", jobID, err)
		}
		return nil
	})
}

func recoverTerminatedQueueJob(ctx context.Context, database *sql.DB, jobID string) error {
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var record generationJobRecord
	var payload []byte
	err = tx.QueryRowContext(ctx, `SELECT job.id, job.operation_id, job.user_id, job.presentation_id, job.kind, job.status, job.payload FROM generation_jobs job JOIN river_job queue_job ON queue_job.id = job.river_job_id WHERE job.id = $1 AND job.status IN ('queued', 'running', 'retrying') AND queue_job.state IN ('cancelled', 'discarded') FOR UPDATE OF job`, jobID).Scan(
		&record.ID, &record.OperationID, &record.UserID, &record.PresentationID, &record.Kind, &record.Status, &payload,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return tx.Commit()
	}
	if err != nil {
		return err
	}
	internalMessage := "Generation worker stopped before completion"
	code := "worker_terminated"
	job := streamJob{operationID: record.OperationID, userID: record.UserID, presentationID: record.PresentationID}
	if err := json.Unmarshal(payload, &record.Payload); err == nil {
		job = record.Payload.streamJob()
	} else {
		code = "invalid_job_payload"
		internalMessage = "Generation job data was invalid"
	}
	if err := failTx(ctx, tx, job, internalMessage); err != nil {
		return err
	}
	message := "Presentation generation failed. Please try again."
	if _, err := tx.ExecContext(ctx, `UPDATE generation_jobs SET status = 'failed', last_error_code = $1, last_error_message = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3`, code, message, record.ID); err != nil {
		return err
	}
	if err := appendEventTx(ctx, tx, record.ID, "error", map[string]any{"error": message, "presentation_id": record.PresentationID}); err != nil {
		return err
	}
	return tx.Commit()
}

type generationWorker struct {
	river.WorkerDefaults[JobArgs]
	handler *handler
}

func (worker *generationWorker) Work(ctx context.Context, riverJob *river.Job[JobArgs]) error {
	return worker.handler.processQueuedJob(ctx, riverJob)
}

func (h *handler) processQueuedJob(ctx context.Context, riverJob *river.Job[JobArgs]) error {
	record, err := h.loadGenerationJob(ctx, riverJob.Args.JobID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) || errors.Is(err, errInvalidJobPayload) {
			return river.JobCancel(err)
		}
		return err
	}
	if record.Status == "succeeded" || record.Status == "failed" || record.Status == "cancelled" {
		return nil
	}

	operationStatus, err := h.operationStatus(ctx, record.OperationID)
	if err != nil {
		return err
	}
	if operationStatus != "reserved" {
		return h.reconcileFinalizedJob(ctx, record, operationStatus, riverJob)
	}
	if record.CancelRequested {
		return h.cancelQueuedJob(ctx, record, riverJob, "Generation was cancelled")
	}

	job := record.Payload.streamJob()
	result, err := h.database.ExecContext(ctx, `UPDATE generation_jobs SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW(), last_error_code = NULL, last_error_message = NULL WHERE id = $1 AND status IN ('queued', 'running', 'retrying') AND cancel_requested_at IS NULL`, record.ID)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return nil
	}
	if riverJob.Attempt > 1 {
		_ = h.appendEvent(ctx, record.ID, "retry", map[string]any{"attempt": riverJob.Attempt, "max_attempts": riverJob.MaxAttempts, "delay_ms": 0, "reason": "Retrying after a temporary provider failure"})
	}
	stageTotal := 3
	if job.kind == "generation" {
		stageTotal = 4
	}
	_ = h.updateStage(ctx, record.ID, "planning", "Planning presentation", 1, stageTotal)

	selection, credential, err := h.connections.CredentialForGeneration(ctx, record.UserID, job.selection)
	if err != nil {
		if retryableProviderError(err) && riverJob.Attempt < riverJob.MaxAttempts {
			return h.scheduleRetry(ctx, record, riverJob, err)
		}
		return h.finalizeQueuedFailure(ctx, record, riverJob, job, "provider_configuration", err.Error())
	}
	job.selection, job.credential = selection, credential

	var plan map[string]any
	tokens := 0
	if job.kind == "generation" {
		var planTokens int
		plan, planTokens, err = h.generatePlan(ctx, job)
		if err != nil {
			if retryableProviderError(err) && riverJob.Attempt < riverJob.MaxAttempts {
				return h.scheduleRetry(ctx, record, riverJob, err)
			}
			return h.finalizeQueuedFailure(ctx, record, riverJob, job, "planning_failure", err.Error())
		}
		tokens += planTokens
		_ = h.appendEvent(ctx, record.ID, "plan", plan)
		_ = h.updateStage(ctx, record.ID, "drafting", "Writing planned slide content", 2, 4)
	}

	document, draftTokens, err := h.generateDocument(ctx, job, plan)
	if err != nil {
		if retryableProviderError(err) && riverJob.Attempt < riverJob.MaxAttempts {
			return h.scheduleRetry(ctx, record, riverJob, err)
		}
		return h.finalizeQueuedFailure(ctx, record, riverJob, job, "provider_failure", err.Error())
	}
	tokens += draftTokens
	if cancelled, err := h.cancelRequested(ctx, record.ID); err != nil {
		return err
	} else if cancelled {
		return h.cancelQueuedJob(ctx, record, riverJob, "Generation was cancelled")
	}
	if job.quote > 0 && tokens <= 0 {
		return h.finalizeQueuedFailure(ctx, record, riverJob, job, "usage_unavailable", "Provider usage was unavailable")
	}

	document["title"] = truncate(text(document["title"], "Untitled Presentation"), 255)
	preserveJobTemplate(document, job)
	document["status"] = "ready"
	document["tokens_used"] = tokens
	if plan != nil {
		document = presentation.ApplyDeckPlan(document, plan)
	}
	rawSlides, ok := document["slides"].([]any)
	if !ok || len(rawSlides) < job.slideCount {
		return h.finalizeQueuedFailure(ctx, record, riverJob, job, "incomplete_document", "The provider returned fewer slides than requested")
	}
	if len(rawSlides) > job.slideCount {
		document["slides"] = rawSlides[:job.slideCount]
	}
	if job.researchPayload != nil {
		document["sources"] = job.researchPayload.Sources
	}
	document, err = presentation.NormalizeDocument(document)
	slides, ok := document["slides"].([]any)
	if err != nil || !ok || len(slides) == 0 || !hasSubstantiveGeneratedContent(slides) {
		return h.finalizeQueuedFailure(ctx, record, riverJob, job, "invalid_document", "Generated presentation was invalid")
	}

	title := text(document["title"], "Untitled Presentation")
	if plan == nil {
		_ = h.updateStage(ctx, record.ID, "drafting", "Writing slide content", 2, 3)
	}
	for index, slide := range slides {
		_ = h.appendEvent(ctx, record.ID, "slide", map[string]any{"index": index, "slide": slide, "title": title})
	}
	if plan != nil {
		_ = h.updateStage(ctx, record.ID, "designing", "Compiling semantic layouts", 3, 4)
	}
	completed, _ := json.Marshal(document)
	charged := actualCharge(tokens, job.quote)
	if err := h.completeQueuedJob(ctx, riverJob, record, job, completed, document, truncate(title, 255), charged, tokens); err != nil {
		if errors.Is(err, errGenerationCancelled) {
			return nil
		}
		if errors.Is(err, errInactiveReservation) || errors.Is(err, errPresentationChanged) {
			return h.finalizeQueuedFailure(ctx, record, riverJob, job, "persistence_failure", err.Error())
		}
		return err
	}
	if job.selection != nil {
		_ = h.connections.MarkUsed(ctx, job.userID, job.selection.Provider)
	}
	return nil
}

func preserveJobTemplate(document map[string]any, job streamJob) {
	document["theme"] = "corporate-blue"
	if job.kind == "iteration" {
		document["theme"] = documentTheme(job.current)
	}
	if job.template == nil {
		delete(document, "template")
		return
	}
	document["template"] = map[string]any{"id": job.template.ID, "version": job.template.Version}
}

func (h *handler) loadGenerationJob(ctx context.Context, jobID string) (generationJobRecord, error) {
	var record generationJobRecord
	var payload []byte
	var cancelRequested sql.NullTime
	err := h.database.QueryRowContext(ctx, `SELECT id, operation_id, user_id, presentation_id, kind, status, payload, cancel_requested_at FROM generation_jobs WHERE id = $1`, jobID).Scan(
		&record.ID, &record.OperationID, &record.UserID, &record.PresentationID, &record.Kind, &record.Status, &payload, &cancelRequested,
	)
	if err != nil {
		return record, err
	}
	if err := json.Unmarshal(payload, &record.Payload); err != nil {
		return record, fmt.Errorf("%w: %v", errInvalidJobPayload, err)
	}
	record.CancelRequested = cancelRequested.Valid
	return record, nil
}

func (h *handler) operationStatus(ctx context.Context, operationID string) (string, error) {
	var status string
	err := h.database.QueryRowContext(ctx, `SELECT status FROM generation_point_operations WHERE id = $1`, operationID).Scan(&status)
	return status, err
}

func (h *handler) reconcileFinalizedJob(ctx context.Context, record generationJobRecord, operationStatus string, riverJob *river.Job[JobArgs]) error {
	status := "failed"
	if operationStatus == "settled" {
		status = "succeeded"
	}
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var currentStatus string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM generation_jobs WHERE id = $1 FOR UPDATE`, record.ID).Scan(&currentStatus); err != nil {
		return err
	}
	if currentStatus == "succeeded" || currentStatus == "failed" || currentStatus == "cancelled" {
		return tx.Commit()
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_jobs SET status = $1, completed_at = COALESCE(completed_at, NOW()), updated_at = NOW() WHERE id = $2 AND status NOT IN ('succeeded', 'failed', 'cancelled')`, status, record.ID); err != nil {
		return err
	}
	if status == "succeeded" {
		var document json.RawMessage
		var balance, charged int64
		if err := tx.QueryRowContext(ctx, `SELECT presentation.slides_data, users.balance_millis, operation.charged_millis FROM presentations presentation JOIN users ON users.id = presentation.user_id JOIN generation_point_operations operation ON operation.id = $1 WHERE presentation.id = $2 AND presentation.user_id = $3`, record.OperationID, record.PresentationID, record.UserID).Scan(&document, &balance, &charged); err != nil {
			return err
		}
		if err := appendEventTx(ctx, tx, record.ID, "complete", document); err != nil {
			return err
		}
		if err := appendEventTx(ctx, tx, record.ID, "stage", map[string]any{"stage": "finalizing", "message": "Saving presentation", "completed": 3, "total": 3}); err != nil {
			return err
		}
		if err := appendEventTx(ctx, tx, record.ID, "saved", map[string]any{"presentation_id": record.PresentationID, "success": true, "slide_tokens_remaining": points(balance), "slide_tokens_charged": points(charged)}); err != nil {
			return err
		}
	} else {
		message := "Presentation generation failed. Please try again."
		if err := appendEventTx(ctx, tx, record.ID, "error", map[string]any{"error": message, "presentation_id": record.PresentationID}); err != nil {
			return err
		}
	}
	if _, err := river.JobCompleteTx[*riverdatabasesql.Driver](ctx, tx, riverJob); err != nil {
		return err
	}
	return tx.Commit()
}

func (h *handler) scheduleRetry(ctx context.Context, record generationJobRecord, riverJob *river.Job[JobArgs], cause error) error {
	message := "The provider is temporarily unavailable"
	result, err := h.database.ExecContext(ctx, `UPDATE generation_jobs SET status = 'retrying', last_error_code = 'provider_temporary', last_error_message = $1, updated_at = NOW() WHERE id = $2 AND status IN ('queued', 'running', 'retrying') AND cancel_requested_at IS NULL`, message, record.ID)
	if err != nil {
		return err
	}
	affected, _ := result.RowsAffected()
	if affected == 0 {
		return nil
	}
	_, _ = h.database.ExecContext(ctx, `UPDATE generation_point_operations SET expires_at = GREATEST(expires_at, NOW() + INTERVAL '1 hour'), updated_at = NOW() WHERE id = $1 AND status = 'reserved'`, record.OperationID)
	_ = h.appendEvent(ctx, record.ID, "retry", map[string]any{"attempt": riverJob.Attempt, "max_attempts": riverJob.MaxAttempts, "reason": message})
	return cause
}

func (h *handler) finalizeQueuedFailure(ctx context.Context, record generationJobRecord, riverJob *river.Job[JobArgs], job streamJob, code, internalMessage string) error {
	message := "Presentation generation failed. Please try again."
	if code == "usage_unavailable" {
		message = "Unable to verify provider usage. Your points were released."
	}
	if code == "persistence_failure" {
		message = "Unable to save presentation. Your points were released."
	}
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM generation_jobs WHERE id = $1 FOR UPDATE`, record.ID).Scan(&status); err != nil {
		return err
	}
	if status == "succeeded" || status == "failed" || status == "cancelled" {
		return tx.Commit()
	}
	if err := failTx(ctx, tx, job, internalMessage); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_jobs SET status = 'failed', last_error_code = $1, last_error_message = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3`, code, message, record.ID); err != nil {
		return err
	}
	if err := appendEventTx(ctx, tx, record.ID, "error", map[string]any{"error": message, "presentation_id": record.PresentationID}); err != nil {
		return err
	}
	if _, err := river.JobCompleteTx[*riverdatabasesql.Driver](ctx, tx, riverJob); err != nil {
		return err
	}
	return tx.Commit()
}

func (h *handler) completeQueuedJob(ctx context.Context, riverJob *river.Job[JobArgs], record generationJobRecord, job streamJob, completed []byte, document map[string]any, title string, charged int64, providerTokens int) error {
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	var cancelRequested sql.NullTime
	if err := tx.QueryRowContext(ctx, `SELECT status, cancel_requested_at FROM generation_jobs WHERE id = $1 FOR UPDATE`, record.ID).Scan(&status, &cancelRequested); err != nil {
		return err
	}
	if status == "succeeded" || status == "failed" || status == "cancelled" {
		return tx.Commit()
	}
	if cancelRequested.Valid {
		message := "Generation was cancelled"
		if err := failTx(ctx, tx, job, message); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE generation_jobs SET status = 'cancelled', last_error_code = 'cancelled', last_error_message = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`, message, record.ID); err != nil {
			return err
		}
		if err := appendEventTx(ctx, tx, record.ID, "error", map[string]any{"error": message, "presentation_id": record.PresentationID}); err != nil {
			return err
		}
		if _, err := river.JobCompleteTx[*riverdatabasesql.Driver](ctx, tx, riverJob); err != nil {
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		return errGenerationCancelled
	}
	balance, err := settleTx(ctx, tx, job, completed, title, charged, providerTokens)
	if err != nil {
		return err
	}
	total := 3
	if job.kind == "generation" {
		total = 4
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_jobs SET status = 'succeeded', stage = 'finalizing', progress_completed = $1, progress_total = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`, total, record.ID); err != nil {
		return err
	}
	if err := appendEventTx(ctx, tx, record.ID, "complete", document); err != nil {
		return err
	}
	if err := appendEventTx(ctx, tx, record.ID, "stage", map[string]any{"stage": "finalizing", "message": "Saving presentation", "completed": total, "total": total}); err != nil {
		return err
	}
	if err := appendEventTx(ctx, tx, record.ID, "saved", map[string]any{"presentation_id": record.PresentationID, "success": true, "slide_tokens_remaining": points(balance), "slide_tokens_charged": points(charged)}); err != nil {
		return err
	}
	if _, err := river.JobCompleteTx[*riverdatabasesql.Driver](ctx, tx, riverJob); err != nil {
		return err
	}
	return tx.Commit()
}

func (h *handler) cancelRequested(ctx context.Context, jobID string) (bool, error) {
	var cancelled bool
	err := h.database.QueryRowContext(ctx, `SELECT cancel_requested_at IS NOT NULL FROM generation_jobs WHERE id = $1`, jobID).Scan(&cancelled)
	return cancelled, err
}

func (h *handler) cancelQueuedJob(ctx context.Context, record generationJobRecord, riverJob *river.Job[JobArgs], message string) error {
	job := record.Payload.streamJob()
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var status string
	if err := tx.QueryRowContext(ctx, `SELECT status FROM generation_jobs WHERE id = $1 FOR UPDATE`, record.ID).Scan(&status); err != nil {
		return err
	}
	if status == "succeeded" || status == "failed" || status == "cancelled" {
		return tx.Commit()
	}
	if err := failTx(ctx, tx, job, message); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_jobs SET status = 'cancelled', last_error_code = 'cancelled', last_error_message = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`, message, record.ID); err != nil {
		return err
	}
	if err := appendEventTx(ctx, tx, record.ID, "error", map[string]any{"error": message, "presentation_id": record.PresentationID}); err != nil {
		return err
	}
	if _, err := river.JobCompleteTx[*riverdatabasesql.Driver](ctx, tx, riverJob); err != nil {
		return err
	}
	return tx.Commit()
}

func retryableProviderError(err error) bool {
	var provider *providerRequestError
	if errors.As(err, &provider) {
		return provider.Status == http.StatusTooManyRequests || provider.Status >= 500
	}
	var network net.Error
	return errors.As(err, &network)
}

func (h *handler) appendEvent(ctx context.Context, jobID, eventType string, payload any) error {
	return appendEventTx(ctx, h.database, jobID, eventType, payload)
}

type eventExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func appendEventTx(ctx context.Context, executor eventExecutor, jobID, eventType string, payload any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = executor.ExecContext(ctx, `INSERT INTO generation_job_events (job_id, event_type, payload) VALUES ($1, $2, $3::jsonb)`, jobID, eventType, encoded)
	return err
}

func (h *handler) updateStage(ctx context.Context, jobID, stage, message string, completed, total int) error {
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `UPDATE generation_jobs SET stage = $1, progress_completed = $2, progress_total = $3, updated_at = NOW() WHERE id = $4`, stage, completed, total, jobID); err != nil {
		return err
	}
	if err := appendEventTx(ctx, tx, jobID, "stage", map[string]any{"stage": stage, "message": message, "completed": completed, "total": total}); err != nil {
		return err
	}
	return tx.Commit()
}

func (h *handler) jobStatus(writer http.ResponseWriter, request *http.Request) {
	userID, err := h.identity(request.Context(), request)
	if err != nil || strings.TrimSpace(userID) == "" {
		writeError(writer, http.StatusUnauthorized, "Authentication required")
		return
	}
	jobID := request.PathValue("id")
	var response struct {
		ID, PresentationID, Kind, Status string
		Stage                            sql.NullString
		Completed, Total                 int
		Error                            sql.NullString
		CreatedAt, UpdatedAt             time.Time
	}
	err = h.database.QueryRowContext(request.Context(), `SELECT id, presentation_id, kind, status, stage, progress_completed, progress_total, last_error_message, created_at, updated_at FROM generation_jobs WHERE id = $1 AND user_id = $2`, jobID, userID).Scan(
		&response.ID, &response.PresentationID, &response.Kind, &response.Status, &response.Stage, &response.Completed, &response.Total, &response.Error, &response.CreatedAt, &response.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(writer, http.StatusNotFound, "Generation job not found")
		return
	}
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to load generation job")
		return
	}
	result := map[string]any{"id": response.ID, "presentation_id": response.PresentationID, "kind": response.Kind, "status": response.Status, "progress": map[string]int{"completed": response.Completed, "total": response.Total}, "created_at": response.CreatedAt, "updated_at": response.UpdatedAt}
	if response.Stage.Valid {
		result["stage"] = response.Stage.String
	}
	if response.Error.Valid {
		result["error"] = response.Error.String
	}
	writeJSON(writer, http.StatusOK, result)
}

func (h *handler) jobEvents(writer http.ResponseWriter, request *http.Request) {
	userID, err := h.identity(request.Context(), request)
	if err != nil || strings.TrimSpace(userID) == "" {
		writeError(writer, http.StatusUnauthorized, "Authentication required")
		return
	}
	h.streamEvents(writer, request, request.PathValue("id"), userID, eventCursor(request))
}

func eventCursor(request *http.Request) int64 {
	value := strings.TrimSpace(request.Header.Get("Last-Event-ID"))
	if value == "" {
		value = strings.TrimSpace(request.URL.Query().Get("after"))
	}
	cursor, _ := strconv.ParseInt(value, 10, 64)
	if cursor < 0 {
		return 0
	}
	return cursor
}

func (h *handler) streamEvents(writer http.ResponseWriter, request *http.Request, jobID, userID string, cursor int64) {
	if !h.streams.acquire(userID) {
		writeError(writer, http.StatusTooManyRequests, "Too many active generation streams")
		return
	}
	defer h.streams.release(userID)

	ctx, cancel := context.WithCancel(request.Context())
	if h.streamContext != nil {
		stopShutdown := context.AfterFunc(h.streamContext, cancel)
		defer stopShutdown()
	}
	defer cancel()

	var presentationID string
	err := h.database.QueryRowContext(ctx, `SELECT presentation_id FROM generation_jobs WHERE id = $1 AND user_id = $2`, jobID, userID).Scan(&presentationID)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(writer, http.StatusNotFound, "Generation job not found")
		return
	}
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to load generation job")
		return
	}
	flusher, ok := writer.(http.Flusher)
	if !ok {
		writeError(writer, http.StatusInternalServerError, "Streaming is unavailable")
		return
	}
	writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-cache, no-transform")
	writer.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()

	poll := time.NewTicker(time.Second)
	keepalive := time.NewTicker(10 * time.Second)
	defer poll.Stop()
	defer keepalive.Stop()
	for {
		terminal, next, err := h.writePendingEvents(ctx, writer, flusher, jobID, cursor)
		if err != nil || terminal {
			return
		}
		cursor = next
		if finalized, err := h.generationJobTerminal(ctx, jobID); err != nil {
			return
		} else if finalized {
			// Finalization may commit between the first event query and status
			// check. Query once more so that race cannot hide the terminal event.
			_, _, _ = h.writePendingEvents(ctx, writer, flusher, jobID, cursor)
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-poll.C:
		case <-keepalive.C:
			_, _ = fmt.Fprintf(writer, ": keepalive %s\n\n", presentationID)
			flusher.Flush()
		}
	}
}

func (h *handler) generationJobTerminal(ctx context.Context, jobID string) (bool, error) {
	var terminal bool
	err := h.database.QueryRowContext(ctx, `SELECT status IN ('succeeded', 'failed', 'cancelled') FROM generation_jobs WHERE id = $1`, jobID).Scan(&terminal)
	return terminal, err
}

func (h *handler) writePendingEvents(ctx context.Context, writer http.ResponseWriter, flusher http.Flusher, jobID string, cursor int64) (bool, int64, error) {
	rows, err := h.database.QueryContext(ctx, `SELECT id, event_type, payload FROM generation_job_events WHERE job_id = $1 AND id > $2 ORDER BY id LIMIT 100`, jobID, cursor)
	if err != nil {
		return false, cursor, err
	}
	type pendingEvent struct {
		id        int64
		eventType string
		payload   json.RawMessage
	}
	events := make([]pendingEvent, 0, 16)
	for rows.Next() {
		var event pendingEvent
		if err := rows.Scan(&event.id, &event.eventType, &event.payload); err != nil {
			_ = rows.Close()
			return false, cursor, err
		}
		event.payload = append(json.RawMessage(nil), event.payload...)
		events = append(events, event)
		if event.eventType == "saved" || event.eventType == "error" {
			break
		}
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return false, cursor, err
	}
	if err := rows.Close(); err != nil {
		return false, cursor, err
	}
	terminal := false
	for _, event := range events {
		if _, err := fmt.Fprintf(writer, "id: %d\nevent: %s\ndata: %s\n\n", event.id, event.eventType, event.payload); err != nil {
			return false, cursor, err
		}
		flusher.Flush()
		cursor = event.id
		terminal = event.eventType == "saved" || event.eventType == "error"
	}
	return terminal, cursor, nil
}

func (h *handler) cancelJob(writer http.ResponseWriter, request *http.Request) {
	userID, err := h.identity(request.Context(), request)
	if err != nil || strings.TrimSpace(userID) == "" {
		writeError(writer, http.StatusUnauthorized, "Authentication required")
		return
	}
	tx, err := h.database.BeginTx(request.Context(), nil)
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to cancel generation")
		return
	}
	defer tx.Rollback()
	var record generationJobRecord
	var payload []byte
	var riverJobID int64
	err = tx.QueryRowContext(request.Context(), `SELECT id, operation_id, user_id, presentation_id, kind, status, payload, river_job_id FROM generation_jobs WHERE id = $1 AND user_id = $2 AND status IN ('queued', 'running', 'retrying') FOR UPDATE`, request.PathValue("id"), userID).Scan(
		&record.ID, &record.OperationID, &record.UserID, &record.PresentationID, &record.Kind, &record.Status, &payload, &riverJobID,
	)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(writer, http.StatusConflict, "Generation is already complete")
		return
	}
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to cancel generation")
		return
	}
	job := streamJob{operationID: record.OperationID, userID: record.UserID, presentationID: record.PresentationID}
	if json.Unmarshal(payload, &record.Payload) == nil {
		job = record.Payload.streamJob()
	}
	message := "Generation was cancelled"
	if _, err := tx.ExecContext(request.Context(), `UPDATE generation_jobs SET cancel_requested_at = COALESCE(cancel_requested_at, NOW()), status = 'cancelled', last_error_code = 'cancelled', last_error_message = $1, completed_at = NOW(), updated_at = NOW() WHERE id = $2`, message, record.ID); err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to cancel generation")
		return
	}
	if err := failTx(request.Context(), tx, job, message); err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to cancel generation")
		return
	}
	if err := appendEventTx(request.Context(), tx, record.ID, "error", map[string]any{"error": message, "presentation_id": record.PresentationID}); err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to cancel generation")
		return
	}
	if _, err := h.queue.JobCancelTx(request.Context(), tx, riverJobID); err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to cancel generation")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to cancel generation")
		return
	}
	writeJSON(writer, http.StatusAccepted, map[string]any{"status": "cancellation_requested"})
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

type providerRequestError struct {
	Status  int
	Message string
}

func (err *providerRequestError) Error() string { return err.Message }
