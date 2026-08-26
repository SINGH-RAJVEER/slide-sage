package generation

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"net/http"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
)

type duplicateOperation struct {
	jobID, presentationID string
}

func (duplicateOperation) Error() string { return "duplicate operation" }

type idempotencyConflict struct{}

func (idempotencyConflict) Error() string { return "idempotency conflict" }

type insufficient struct{ balance, required int64 }

func (e insufficient) Error() string { return "Insufficient points" }

// enqueue atomically creates the authorization, placeholder, durable domain job,
// and River queue record. The job ID is the idempotency token: submissions of
// one user serialize on their balance row, so a repeated job ID attaches to the
// committed job instead of reserving points twice.
func (h *handler) enqueue(ctx context.Context, job streamJob, requestHash string, create bool, prompt string, data []byte) (int64, int, error) {
	if h.queue == nil {
		return 0, 0, errors.New("generation queue is unavailable")
	}
	if err := h.recoverExpired(ctx, job.userID); err != nil {
		return 0, 0, err
	}
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()
	// Serializing same-user submissions on this row makes the duplicate check
	// below safe without a separate advisory-lock protocol.
	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1 FOR UPDATE`, job.userID).Scan(&balance); err != nil {
		return 0, 0, err
	}
	var existingHash, existingPresentationID string
	err = tx.QueryRowContext(ctx, `SELECT COALESCE(payload->>'request_hash', ''), presentation_id FROM generation_jobs WHERE id = $1 AND user_id = $2`, job.jobID, job.userID).Scan(&existingHash, &existingPresentationID)
	if err == nil {
		if existingHash == requestHash {
			return 0, 0, duplicateOperation{jobID: job.jobID, presentationID: existingPresentationID}
		}
		return 0, 0, idempotencyConflict{}
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, 0, err
	}
	if balance < job.quote {
		return 0, 0, insufficient{balance: balance, required: job.quote}
	}
	if job.quote > 0 {
		if _, err := tx.ExecContext(ctx, `UPDATE users SET balance_millis = balance_millis - $1, updated_at = NOW() WHERE id = $2`, job.quote, job.userID); err != nil {
			return 0, 0, err
		}
		balance -= job.quote
	}
	revision := 0
	if create {
		if _, err := tx.ExecContext(ctx, `INSERT INTO presentations (id, user_id, title, prompt, slides_data) VALUES ($1, $2, $3, $4, $5::jsonb)`, job.presentationID, job.userID, "Generating...", prompt, data); err != nil {
			return 0, 0, err
		}
	} else if data != nil {
		if err := tx.QueryRowContext(ctx, `UPDATE presentations SET title = $1, prompt = $2, slides_data = $3::jsonb, revision = revision + 1, updated_at = NOW() WHERE id = $4 AND user_id = $5 AND slides_data->>'status' = 'failed' RETURNING revision`, "Generating...", prompt, data, job.presentationID, job.userID).Scan(&revision); err != nil {
			return 0, 0, err
		}
	} else {
		if err := tx.QueryRowContext(ctx, `SELECT revision FROM presentations WHERE id = $1 AND user_id = $2`, job.presentationID, job.userID).Scan(&revision); err != nil {
			return 0, 0, err
		}
	}
	job.expectedRevision = revision
	job.requestHash = requestHash
	payload, err := json.Marshal(payloadFromJob(job))
	if err != nil {
		return 0, 0, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO generation_point_operations (id, user_id, presentation_id, kind, idempotency_key, request_hash, pricing_version, quoted_millis, expires_at) VALUES ($1, $2, $3, $4, $5, $6, '2026-08-v1', $7, NOW() + INTERVAL '1 hour')`, job.operationID, job.userID, job.presentationID, job.kind, job.jobID, requestHash, job.quote)
	if err != nil {
		return 0, 0, err
	}
	if job.quote > 0 {
		entryType := "model_reservation"
		if job.kind == "research" {
			entryType = "research_reservation"
		}
		if err := recordLedger(tx, job.userID, job.operationID, entryType, -job.quote, balance); err != nil {
			return 0, 0, err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO generation_jobs (id, operation_id, user_id, presentation_id, kind, payload, expected_revision, status, stage, progress_completed, progress_total) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'queued', 'planning', 1, 3)`, job.jobID, job.operationID, job.userID, job.presentationID, job.kind, payload, revision); err != nil {
		return 0, 0, err
	}
	inserted, err := h.queue.InsertTx(ctx, tx, JobArgs{JobID: job.jobID}, nil)
	if err != nil {
		return 0, 0, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_jobs SET river_job_id = $1 WHERE id = $2`, inserted.Job.ID, job.jobID); err != nil {
		return 0, 0, err
	}
	if err := appendEventTx(ctx, tx, job.jobID, "created", map[string]any{"job_id": job.jobID, "presentation_id": job.presentationID}); err != nil {
		return 0, 0, err
	}
	if job.researchPayload != nil {
		if err := appendEventTx(ctx, tx, job.jobID, "research", map[string]any{"status": "ready", "sources": job.researchPayload.Sources}); err != nil {
			return 0, 0, err
		}
	}
	theme := "corporate-blue"
	if job.kind == "iteration" {
		theme = documentTheme(job.current)
	}
	if err := appendEventTx(ctx, tx, job.jobID, "theme", map[string]any{"theme": theme}); err != nil {
		return 0, 0, err
	}
	if err := appendEventTx(ctx, tx, job.jobID, "stage", map[string]any{"stage": "planning", "message": "Preparing presentation", "completed": 1, "total": 3}); err != nil {
		return 0, 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	return balance, revision, nil
}

func settleTx(ctx context.Context, tx *sql.Tx, job streamJob, data []byte, title string, charged int64, providerTokens int) (int64, error) {
	result, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET status = 'settled', charged_millis = $1, provider_total_tokens = $2, finalized_at = NOW(), updated_at = NOW() WHERE id = $3 AND user_id = $4 AND presentation_id = $5 AND status = 'reserved' AND quoted_millis >= $1`, charged, providerTokens, job.operationID, job.userID, job.presentationID)
	if err != nil {
		return 0, err
	}
	affected, _ := result.RowsAffected()
	if affected != 1 {
		return 0, errInactiveReservation
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1 FOR UPDATE`, job.userID).Scan(&balance); err != nil {
		return 0, err
	}
	provider, selectedModel := "openrouter", model()
	if job.selection != nil {
		provider, selectedModel = string(job.selection.Provider), job.selection.Model
	}
	result, err = tx.ExecContext(ctx, `UPDATE presentations SET title = $1, prompt = $2, slides_data = $3::jsonb, ai_provider = $4, ai_model = $5, revision = revision + 1, updated_at = NOW() WHERE id = $6 AND user_id = $7 AND revision = $8`, title, job.prompt, data, provider, selectedModel, job.presentationID, job.userID, job.expectedRevision)
	if err != nil {
		return 0, err
	}
	affected, _ = result.RowsAffected()
	if affected != 1 {
		return 0, errPresentationChanged
	}
	refund := job.quote - charged
	if refund > 0 {
		if err := tx.QueryRowContext(ctx, `UPDATE users SET balance_millis = balance_millis + $1, updated_at = NOW() WHERE id = $2 RETURNING balance_millis`, refund, job.userID).Scan(&balance); err != nil {
			return 0, err
		}
	}
	if refund > 0 {
		if err := recordLedger(tx, job.userID, job.operationID, "reservation_release", refund, balance); err != nil {
			return 0, err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET balance_after_millis = $1 WHERE id = $2`, balance, job.operationID); err != nil {
		return 0, err
	}
	return balance, nil
}

func failTx(ctx context.Context, tx *sql.Tx, job streamJob, message string) error {
	refunded, err := refundReservationTx(ctx, tx, job.operationID, job.userID, message)
	if err != nil || !refunded {
		return err
	}

	if job.kind == "generation" {
		failed := map[string]any{
			"title":  "Generation failed",
			"theme":  "corporate-blue",
			"slides": []any{},
			"status": "failed",
			"failure": map[string]any{
				"message": message,
				"retry": map[string]any{
					"prompt":           job.prompt,
					"slide_count":      job.slideCount,
					"detail_level":     job.detailLevel,
					"tonality":         job.tonality,
					"research_enabled": job.research != nil || job.researchPayload != nil,
					"research_payload": job.researchPayload,
					"ai":               job.selection,
				},
			},
		}
		data, _ := json.Marshal(failed)
		// Presentation state is secondary to the financial finalization. A user
		// edit or deletion must never retain a reserved balance.
		_, _ = tx.ExecContext(ctx, `UPDATE presentations SET title = $1, prompt = $2, slides_data = $3::jsonb, revision = revision + 1, updated_at = NOW() WHERE id = $4 AND user_id = $5 AND revision = $6`, "Generation failed", job.prompt, data, job.presentationID, job.userID, job.expectedRevision)
	}
	return nil
}

func refundReservationTx(ctx context.Context, tx *sql.Tx, operationID, userID, message string) (bool, error) {
	var quote int64
	err := tx.QueryRowContext(ctx, `UPDATE generation_point_operations SET status = 'refunded', charged_millis = 0, error_reason = $1, finalized_at = NOW(), updated_at = NOW() WHERE id = $2 AND user_id = $3 AND status = 'reserved' RETURNING quoted_millis`, message, operationID, userID).Scan(&quote)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, `UPDATE users SET balance_millis = balance_millis + $1, updated_at = NOW() WHERE id = $2 RETURNING balance_millis`, quote, userID).Scan(&balance); err != nil {
		return false, err
	}
	if quote > 0 {
		if err := recordLedger(tx, userID, operationID, "reservation_release", quote, balance); err != nil {
			return false, err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET balance_after_millis = $1 WHERE id = $2`, balance, operationID); err != nil {
		return false, err
	}
	return true, nil
}

func (h *handler) recoverExpired(ctx context.Context, userID string) error {
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT operation.id, operation.quoted_millis, operation.presentation_id, operation.kind FROM generation_point_operations operation WHERE operation.user_id = $1 AND operation.status = 'reserved' AND operation.expires_at <= NOW() AND NOT EXISTS (SELECT 1 FROM generation_jobs job WHERE job.operation_id = operation.id AND job.status IN ('queued', 'running', 'retrying')) ORDER BY operation.expires_at LIMIT 100 FOR UPDATE OF operation SKIP LOCKED`, userID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type expiredOperation struct {
		id, presentationID, kind string
		quote                    int64
	}
	expired := []expiredOperation{}
	for rows.Next() {
		var item expiredOperation
		if err := rows.Scan(&item.id, &item.quote, &item.presentationID, &item.kind); err != nil {
			return err
		}
		expired = append(expired, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if len(expired) == 0 {
		return tx.Commit()
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&balance); err != nil {
		return err
	}
	for _, item := range expired {
		result, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET status = 'refunded', charged_millis = 0, error_reason = 'lease expired', finalized_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'reserved'`, item.id)
		if err != nil {
			return err
		}
		affected, err := result.RowsAffected()
		if err != nil || affected != 1 {
			return errors.New("expired operation was not active")
		}
		balance += item.quote
		if err := recordLedger(tx, userID, item.id, "lease_release", item.quote, balance); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET balance_after_millis = $1 WHERE id = $2`, balance, item.id); err != nil {
			return err
		}
		if item.kind == "generation" && item.presentationID != "" {
			_, _ = tx.ExecContext(ctx, `UPDATE presentations SET title = 'Generation failed', slides_data = jsonb_set(jsonb_set(slides_data, '{status}', '"failed"'::jsonb, true), '{failure,message}', to_jsonb('Generation was interrupted before completion'::text), true), revision = revision + 1, updated_at = NOW() WHERE id = $1 AND slides_data->>'status' = 'generating'`, item.presentationID)
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET balance_millis = $1, updated_at = NOW() WHERE id = $2`, balance, userID); err != nil {
		return err
	}
	return tx.Commit()
}

func recordLedger(tx *sql.Tx, userID, operationID, entryType string, delta, balance int64) error {
	if delta == 0 {
		return nil
	}
	_, err := tx.Exec(`INSERT INTO point_ledger (id, user_id, operation_id, entry_type, delta_millis, balance_after_millis) VALUES (md5(random()::text || clock_timestamp()::text), $1, $2, $3, $4, $5)`, userID, operationID, entryType, delta, balance)
	return err
}

func authorizationMillis(slideCount int, prompt string, current json.RawMessage, research any, payload *presentation.ResearchPayload, planningOutputTokens int) int64 {
	encodedResearch, _ := json.Marshal(research)
	encodedSources, _ := json.Marshal(payload)
	inputBytes := len(generationSystemPrompt) + len(prompt) + len(current) + len(encodedResearch) + len(encodedSources) + 256
	// The validated plan becomes part of the drafting input after the planning
	// call, so reserve for its bounded output a second time as prompt context.
	inputTokens := (inputBytes+3)/4 + planningOutputTokens
	outputTokens := maxOutputTokens(slideCount) + planningOutputTokens
	// The provider may add protocol tokens beyond the serialized prompt. The
	// buffer makes the authorization a real maximum while settlement charges the
	// provider's exact aggregate usage.
	return int64(outputTokens + (inputTokens*12+9)/10)
}

func maxOutputTokens(slideCount int) int {
	outputTokens := slideCount * 1200
	if outputTokens < 2000 {
		return 2000
	}
	if outputTokens > 16000 {
		return 16000
	}
	return outputTokens
}

func maxPlanOutputTokens(slideCount int) int {
	outputTokens := 600 + slideCount*240
	if outputTokens > 4000 {
		return 4000
	}
	return outputTokens
}

func points(millis int64) float64 {
	return float64(millis) / 1000
}

func actualCharge(tokens int, quote int64) int64 {
	if quote == 0 || tokens <= 0 {
		return 0
	}
	charge := int64(tokens)
	if charge > quote {
		return quote
	}
	return charge
}

func estimate(slides int, detail, tonality string, researchTokens int) float64 {
	detailMultiplier := map[string]float64{"brief": .6, "concise": .8, "balanced": 1, "detailed": 2, "comprehensive": 2.5}[detail]
	if detailMultiplier == 0 {
		detailMultiplier = 1
	}
	toneMultiplier := map[string]float64{"casual": .9, "professional": 1, "enthusiastic": 1.05, "persuasive": 1.1}[tonality]
	if toneMultiplier == 0 {
		toneMultiplier = 1
	}
	return math.Round((float64(slides)*detailMultiplier*toneMultiplier+float64(researchTokens)/1000)*10) / 10
}

func (h *handler) reservationError(writer http.ResponseWriter, err error) {
	var funds insufficient
	if errors.As(err, &funds) {
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusPaymentRequired)
		_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]string{"message": funds.Error(), "code": "INSUFFICIENT_TOKENS"}, "slide_tokens_remaining": points(funds.balance), "slide_tokens_required": points(funds.required), "slide_tokens_shortfall": points(funds.required - funds.balance)})
		return
	}
	var duplicate duplicateOperation
	if errors.As(err, &duplicate) {
		writeError(writer, http.StatusConflict, "This request is already being processed")
		return
	}
	var conflict idempotencyConflict
	if errors.As(err, &conflict) {
		writeError(writer, http.StatusConflict, "Idempotency key was reused with a different request")
		return
	}
	writeError(writer, http.StatusInternalServerError, "Unable to reserve generation points")
}
