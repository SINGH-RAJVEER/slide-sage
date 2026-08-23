package presentation

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

const researchFeeMillis int64 = 1000

// ResearchPreview carries the synchronous result of a paid research lookup.
type ResearchPreview struct {
	Sources         []Source
	EstimatedTokens float64
	RemainingPoints float64
}

// ResearchPreviewError exposes research failures with an HTTP status so the
// unified submission endpoint can forward them directly.
type ResearchPreviewError struct {
	Status          int
	Message         string
	Insufficient    bool
	RemainingPoints float64
	RequiredPoints  float64
}

func (e *ResearchPreviewError) Error() string { return e.Message }

// RunResearchPreview reserves research points, executes the search, and either
// settles the reservation on success or refunds it on failure. It backs the
// preview mode of POST /presentation-jobs.
func RunResearchPreview(ctx context.Context, database *sql.DB, service *ExaResearchService, userID, key, hash, topic string, options ResearchOptions, slideCount int, detailLevel, tonality string) (*ResearchPreview, error) {
	handler := &presentationHandler{database: database, research: service}
	operationID, err := researchOperationID()
	if err != nil {
		return nil, err
	}
	balance, err := handler.reserveResearch(ctx, operationID, userID, key, hash)
	if err != nil {
		var insufficient researchInsufficient
		if errors.As(err, &insufficient) {
			return nil, &ResearchPreviewError{Status: http.StatusPaymentRequired, Message: insufficient.Error(), Insufficient: true, RemainingPoints: float64(insufficient.balance) / 1000, RequiredPoints: float64(researchFeeMillis) / 1000}
		}
		var duplicate researchDuplicate
		if errors.As(err, &duplicate) {
			return nil, &ResearchPreviewError{Status: http.StatusConflict, Message: "This research request is already being processed"}
		}
		var conflict researchIdempotencyConflict
		if errors.As(err, &conflict) {
			return nil, &ResearchPreviewError{Status: http.StatusConflict, Message: conflict.Error()}
		}
		return nil, err
	}
	sources, searchErr := service.Search(ctx, topic, options)
	if searchErr != nil {
		refundCtx, cancelRefund := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		_ = handler.refundResearch(refundCtx, operationID, userID, "Research provider failed")
		cancelRefund()
		return nil, &ResearchPreviewError{Status: http.StatusBadGateway, Message: "Research service is unavailable"}
	}
	if err := handler.settleResearch(ctx, operationID, userID, balance); err != nil {
		refundCtx, cancelRefund := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		_ = handler.refundResearch(refundCtx, operationID, userID, "Research settlement failed")
		cancelRefund()
		return nil, &ResearchPreviewError{Status: http.StatusInternalServerError, Message: "Unable to settle research points"}
	}
	encodedSources, _ := json.Marshal(sources)
	estimated := estimatePoints(slideCount, detailLevel, tonality, (len(encodedSources)+3)/4)
	return &ResearchPreview{Sources: sources, EstimatedTokens: estimated, RemainingPoints: float64(balance) / 1000}, nil
}

type researchDuplicate struct{}

func (researchDuplicate) Error() string { return "duplicate research operation" }

type researchIdempotencyConflict struct{}

func (researchIdempotencyConflict) Error() string { return "research idempotency conflict" }

type researchInsufficient struct{ balance int64 }

func (researchInsufficient) Error() string { return "insufficient points" }

func researchOperationID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func researchIdempotencyKey(request *http.Request) (string, error) {
	key := strings.TrimSpace(request.Header.Get("Idempotency-Key"))
	if len(key) < 16 || len(key) > 128 {
		return "", errors.New("Idempotency-Key must contain 16-128 characters")
	}
	for _, character := range key {
		if !(character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' || character == '-' || character == '_' || character == '.') {
			return "", errors.New("Idempotency-Key contains invalid characters")
		}
	}
	return key, nil
}

func (h *presentationHandler) reserveResearch(ctx context.Context, operationID, userID, key, hash string) (int64, error) {
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, userID+":research:"+key); err != nil {
		return 0, err
	}
	var existingHash string
	err = tx.QueryRowContext(ctx, `SELECT request_hash FROM generation_point_operations WHERE user_id = $1 AND kind = 'research' AND idempotency_key = $2 FOR UPDATE`, userID, key).Scan(&existingHash)
	if err == nil {
		if existingHash == hash {
			return 0, researchDuplicate{}
		}
		return 0, researchIdempotencyConflict{}
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, err
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&balance); err != nil {
		return 0, err
	}
	if balance < researchFeeMillis {
		return 0, researchInsufficient{balance: balance}
	}
	if err := tx.QueryRowContext(ctx, `UPDATE users SET balance_millis = balance_millis - $1, updated_at = NOW() WHERE id = $2 RETURNING balance_millis`, researchFeeMillis, userID).Scan(&balance); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO generation_point_operations (id, user_id, kind, idempotency_key, request_hash, pricing_version, quoted_millis, expires_at) VALUES ($1, $2, 'research', $3, $4, '2026-08-v1', $5, NOW() + INTERVAL '2 minutes')`, operationID, userID, key, hash, researchFeeMillis); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO point_ledger (id, user_id, operation_id, entry_type, delta_millis, balance_after_millis) VALUES (md5(random()::text || clock_timestamp()::text), $1, $2, 'research_reservation', $3, $4)`, userID, operationID, -researchFeeMillis, balance); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return balance, nil
}

func (h *presentationHandler) settleResearch(ctx context.Context, operationID, userID string, _ int64) error {
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&balance); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET status = 'settled', charged_millis = $1, balance_after_millis = $2, finalized_at = NOW(), updated_at = NOW() WHERE id = $3 AND user_id = $4 AND kind = 'research' AND status = 'reserved'`, researchFeeMillis, balance, operationID, userID)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil || affected != 1 {
		return errors.New("research point operation is not active")
	}
	return tx.Commit()
}

func (h *presentationHandler) refundResearch(ctx context.Context, operationID, userID, reason string) error {
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var quote int64
	err = tx.QueryRowContext(ctx, `UPDATE generation_point_operations SET status = 'refunded', charged_millis = 0, error_reason = $1, finalized_at = NOW(), updated_at = NOW() WHERE id = $2 AND user_id = $3 AND kind = 'research' AND status = 'reserved' RETURNING quoted_millis`, reason, operationID, userID).Scan(&quote)
	if errors.Is(err, sql.ErrNoRows) {
		return tx.Commit()
	}
	if err != nil {
		return err
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, `UPDATE users SET balance_millis = balance_millis + $1, updated_at = NOW() WHERE id = $2 RETURNING balance_millis`, quote, userID).Scan(&balance); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO point_ledger (id, user_id, operation_id, entry_type, delta_millis, balance_after_millis) VALUES (md5(random()::text || clock_timestamp()::text), $1, $2, 'reservation_release', $3, $4)`, userID, operationID, quote, balance); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET balance_after_millis = $1 WHERE id = $2`, balance, operationID); err != nil {
		return err
	}
	return tx.Commit()
}

func (h *presentationHandler) writeResearchReservationError(writer http.ResponseWriter, err error) {
	var insufficient researchInsufficient
	if errors.As(err, &insufficient) {
		writeJSON(writer, http.StatusPaymentRequired, map[string]any{"error": map[string]string{"message": "Insufficient points", "code": "INSUFFICIENT_TOKENS"}, "slide_tokens_remaining": float64(insufficient.balance) / 1000, "slide_tokens_required": float64(researchFeeMillis) / 1000, "slide_tokens_shortfall": float64(researchFeeMillis-insufficient.balance) / 1000})
		return
	}
	var duplicate researchDuplicate
	if errors.As(err, &duplicate) {
		writeError(writer, http.StatusConflict, "This research request is already being processed")
		return
	}
	var conflict researchIdempotencyConflict
	if errors.As(err, &conflict) {
		writeError(writer, http.StatusConflict, "Idempotency key was reused with a different request")
		return
	}
	writeError(writer, http.StatusInternalServerError, "Unable to reserve research points")
}
