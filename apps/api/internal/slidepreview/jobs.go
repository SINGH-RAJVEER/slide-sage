package slidepreview

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"
)

// Queue is separate from generation so a slow render never delays a deck that
// is already downloadable.
const Queue = "previews"

// JobArgs names one immutable revision. Revisions never change, so a repeated
// job is either a retry or a no-op.
type JobArgs struct {
	PresentationID string `json:"presentation_id"`
	Revision       int    `json:"revision"`
}

func (JobArgs) Kind() string { return "presentation_preview_v1" }

func (JobArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{
		Queue:       Queue,
		MaxAttempts: 4,
		// Completed jobs are left out of the uniqueness check so a revision
		// whose earlier job finished without previews can be enqueued again.
		UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: []rivertype.JobState{
			rivertype.JobStateAvailable,
			rivertype.JobStatePending,
			rivertype.JobStateRunning,
			rivertype.JobStateRetryable,
			rivertype.JobStateScheduled,
		}},
	}
}

type Worker struct {
	river.WorkerDefaults[JobArgs]
	service *Service
}

func NewWorker(service *Service) *Worker {
	return &Worker{service: service}
}

func (worker *Worker) Work(ctx context.Context, job *river.Job[JobArgs]) error {
	if job.Args.PresentationID == "" || job.Args.Revision <= 0 {
		return river.JobCancel(errors.New("invalid preview job payload"))
	}
	err := worker.service.Render(ctx, job.Args.PresentationID, presentationrevision.RevisionNumber(job.Args.Revision))
	// A corrupt or oversized package will not render on a later attempt, so the
	// job is cancelled instead of retried; the revision stays downloadable.
	if errors.Is(err, ErrRevisionCorrupt) || errors.Is(err, ErrTooManySlides) ||
		errors.Is(err, presentationrevision.ErrPackageTooLarge) || errors.Is(err, presentationrevision.ErrObjectNotFound) {
		return river.JobCancel(err)
	}
	// A held claim is not a failure of this deck, so the job waits for the claim
	// to clear instead of spending an attempt on it.
	if errors.Is(err, ErrPreviewClaimHeld) {
		return river.JobSnooze(DefaultClaimRetryAfter)
	}
	return err
}

// EnqueueNow schedules preview rendering outside a transaction, for callers
// whose revision commit owns its own transaction. Jobs are unique by arguments,
// so a repeated insert for the same revision collapses into one.
func EnqueueNow(ctx context.Context, client *river.Client[*sql.Tx], presentationID string, number presentationrevision.RevisionNumber) error {
	args := JobArgs{PresentationID: presentationID, Revision: int(number)}
	if _, err := client.Insert(ctx, args, nil); err != nil {
		return fmt.Errorf("enqueue preview render for %s revision %d: %w", presentationID, number, err)
	}
	return nil
}

// Enqueue schedules preview rendering for a committed revision. Callers pass
// the transaction that commits the revision so a preview job never outlives a
// rolled-back commit.
func Enqueue(ctx context.Context, client *river.Client[*sql.Tx], transaction *sql.Tx, presentationID string, number presentationrevision.RevisionNumber) error {
	args := JobArgs{PresentationID: presentationID, Revision: int(number)}
	if _, err := client.InsertTx(ctx, transaction, args, nil); err != nil {
		return fmt.Errorf("enqueue preview render for %s revision %d: %w", presentationID, number, err)
	}
	return nil
}
