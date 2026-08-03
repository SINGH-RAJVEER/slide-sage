package presentation

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
)

var ErrPresentationNotFound = errors.New("presentation not found")
var ErrUnauthorized = errors.New("unauthorized access to presentation")
var ErrPresentationConflict = errors.New("presentation changed while it was being saved")

type Repository struct {
	db DBTX
}

func NewRepository(db DBTX) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Create(ctx context.Context, input NewPresentation) (Presentation, error) {
	if input.ID == "" {
		id, err := newUUID()
		if err != nil {
			return Presentation{}, err
		}
		input.ID = id
	}
	if input.UserID == "" || input.Title == "" || input.Prompt == "" || !json.Valid(input.SlidesData) {
		return Presentation{}, errors.New("presentation requires user ID, title, prompt, and valid slides data")
	}
	const query = `INSERT INTO presentations (id, user_id, title, prompt, slides_data, ai_provider, ai_model, parent_presentation_id)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
        RETURNING id, user_id, title, prompt, slides_data, ai_provider, ai_model, parent_presentation_id, revision, created_at, updated_at`
	return scanPresentation(r.db.QueryRowContext(ctx, query, input.ID, input.UserID, input.Title, input.Prompt, input.SlidesData, input.AIProvider, input.AIModel, input.ParentPresentationID))
}

func (r *Repository) FindByID(ctx context.Context, presentationID string) (Presentation, error) {
	const query = `SELECT id, user_id, title, prompt, slides_data, ai_provider, ai_model, parent_presentation_id, revision, created_at, updated_at
        FROM presentations WHERE id = $1`
	presentation, err := scanPresentation(r.db.QueryRowContext(ctx, query, presentationID))
	if errors.Is(err, ErrPresentationNotFound) {
		return Presentation{}, ErrPresentationNotFound
	}
	return presentation, err
}

func (r *Repository) ListByUserID(ctx context.Context, userID string, limit, offset int) (PresentationPage, error) {
	if limit < 1 || limit > 100 || offset < 0 {
		return PresentationPage{}, errors.New("invalid presentation pagination")
	}
	var total int
	if err := r.db.QueryRowContext(ctx, `SELECT count(*) FROM presentations WHERE user_id = $1`, userID).Scan(&total); err != nil {
		return PresentationPage{}, fmt.Errorf("count presentations: %w", err)
	}
	rows, err := r.db.QueryContext(ctx, `SELECT id, user_id, title, prompt, slides_data, ai_provider, ai_model, parent_presentation_id, revision, created_at, updated_at
        FROM presentations WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return PresentationPage{}, fmt.Errorf("list presentations: %w", err)
	}
	defer rows.Close()
	page := PresentationPage{Total: total}
	for rows.Next() {
		presentation, err := scanPresentation(rows)
		if err != nil {
			return PresentationPage{}, err
		}
		page.Presentations = append(page.Presentations, presentation)
	}
	if err := rows.Err(); err != nil {
		return PresentationPage{}, fmt.Errorf("iterate presentations: %w", err)
	}
	page.HasMore = offset+len(page.Presentations) < total
	return page, nil
}

func (r *Repository) DeleteOwned(ctx context.Context, presentationID, userID string) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM presentations WHERE id = $1 AND user_id = $2`, presentationID, userID)
	if err != nil {
		return fmt.Errorf("delete presentation: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read deletion result: %w", err)
	}
	if affected > 0 {
		return nil
	}
	presentation, err := r.FindByID(ctx, presentationID)
	if errors.Is(err, ErrPresentationNotFound) {
		return ErrPresentationNotFound
	}
	if err != nil {
		return err
	}
	if presentation.UserID != userID {
		return ErrUnauthorized
	}
	return ErrPresentationNotFound
}

func (r *Repository) UpdateOwnedAtRevision(ctx context.Context, presentationID, userID string, revision int, title string, slidesData json.RawMessage) (Presentation, error) {
	if title == "" || !json.Valid(slidesData) {
		return Presentation{}, errors.New("presentation update requires title and valid slides data")
	}
	const query = `UPDATE presentations
        SET title = $1, slides_data = $2::jsonb, revision = revision + 1, updated_at = NOW()
        WHERE id = $3 AND user_id = $4 AND revision = $5
        RETURNING id, user_id, title, prompt, slides_data, ai_provider, ai_model, parent_presentation_id, revision, created_at, updated_at`
	presentation, err := scanPresentation(r.db.QueryRowContext(ctx, query, title, slidesData, presentationID, userID, revision))
	if errors.Is(err, ErrPresentationNotFound) {
		return Presentation{}, ErrPresentationConflict
	}
	return presentation, err
}

type scanner interface {
	Scan(...any) error
}

func scanPresentation(row scanner) (Presentation, error) {
	var presentation Presentation
	var slidesData []byte
	err := row.Scan(&presentation.ID, &presentation.UserID, &presentation.Title, &presentation.Prompt, &slidesData,
		&presentation.AIProvider, &presentation.AIModel, &presentation.ParentPresentationID, &presentation.Revision,
		&presentation.CreatedAt, &presentation.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Presentation{}, ErrPresentationNotFound
	}
	if err != nil {
		return Presentation{}, fmt.Errorf("scan presentation: %w", err)
	}
	if !json.Valid(slidesData) {
		return Presentation{}, errors.New("scan presentation: invalid slides data JSON")
	}
	presentation.SlidesData = append(json.RawMessage(nil), slidesData...)
	return presentation, nil
}

func newUUID() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("generate presentation ID: %w", err)
	}
	bytes[6] = bytes[6]&0x0f | 0x40
	bytes[8] = bytes[8]&0x3f | 0x80
	encoded := hex.EncodeToString(bytes)
	return encoded[0:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:], nil
}
