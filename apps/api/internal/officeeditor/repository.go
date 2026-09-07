package officeeditor

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/slidepreview"
	"github.com/riverqueue/river"
)

type PostgresPresentations struct {
	database *sql.DB
}

var _ PresentationLookup = (*PostgresPresentations)(nil)

func NewPostgresPresentations(database *sql.DB) *PostgresPresentations {
	return &PostgresPresentations{database: database}
}

func (repository *PostgresPresentations) OwnedPresentation(ctx context.Context, presentationID, userID string) (Presentation, bool, error) {
	const query = `SELECT id, user_id, title, COALESCE(current_pptx_revision, 0)
		FROM presentations WHERE id = $1 AND user_id = $2`
	return scanPresentation(repository.database.QueryRowContext(ctx, query, presentationID, userID))
}

func (repository *PostgresPresentations) Presentation(ctx context.Context, presentationID string) (Presentation, bool, error) {
	const query = `SELECT id, user_id, title, COALESCE(current_pptx_revision, 0)
		FROM presentations WHERE id = $1`
	return scanPresentation(repository.database.QueryRowContext(ctx, query, presentationID))
}

func scanPresentation(row *sql.Row) (Presentation, bool, error) {
	var presentation Presentation
	err := row.Scan(&presentation.ID, &presentation.OwnerID, &presentation.Title, &presentation.Revision)
	if errors.Is(err, sql.ErrNoRows) {
		return Presentation{}, false, nil
	}
	if err != nil {
		return Presentation{}, false, fmt.Errorf("read presentation for editor: %w", err)
	}
	return presentation, true, nil
}

// QueuePreviews schedules preview rendering through River.
type QueuePreviews struct {
	client *river.Client[*sql.Tx]
}

var _ PreviewScheduler = (*QueuePreviews)(nil)

func NewQueuePreviews(client *river.Client[*sql.Tx]) *QueuePreviews {
	return &QueuePreviews{client: client}
}

func (queue *QueuePreviews) SchedulePreviews(ctx context.Context, presentationID string, number presentationrevision.RevisionNumber) error {
	return slidepreview.EnqueueNow(ctx, queue.client, presentationID, number)
}
