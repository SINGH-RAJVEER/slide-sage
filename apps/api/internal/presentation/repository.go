package presentation

import (
	"context"
	"database/sql"
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

func (r *Repository) FindByID(ctx context.Context, presentationID string) (Presentation, error) {
	const query = `SELECT id, user_id, title, prompt, ` + documentProjection + `, ai_provider, ai_model, parent_presentation_id, revision, created_at, updated_at
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
	rows, err := r.db.QueryContext(ctx, `SELECT id, user_id, title, prompt, `+documentProjection+`, ai_provider, ai_model, parent_presentation_id, revision, created_at, updated_at
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

// Canonical document metadata comes from the current revision, including editor saves.
// The stored semantic slides array is never returned; nothing renders it, because canonical
// decks draw from preview images. A presentation without a committed revision is still
// generating and reports no revision and zero slides.
const documentProjection = `(slides_data - 'slides') || COALESCE((SELECT jsonb_build_object('totalSlides',r.slide_count,'currentRevision',jsonb_build_object('revision',r.revision,'slideCount',r.slide_count,'byteSize',r.byte_size,'sha256',r.sha256,'previewStatus',r.preview_status,'previewCount',r.preview_count,'createdAt',r.created_at)) FROM presentation_revisions r WHERE r.presentation_id=presentations.id AND r.revision=presentations.current_pptx_revision),'{}'::jsonb)`
