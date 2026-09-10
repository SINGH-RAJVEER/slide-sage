package slidepreview

import (
	"database/sql"
	"errors"
	"time"

	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverdatabasesql"
)

// NewWorkerClient builds the River client for the preview process. Rendering
// runs in its own process because LibreOffice needs an image the API and
// generation workers deliberately do not carry.
func NewWorkerClient(database *sql.DB, service *Service, maxWorkers int) (*river.Client[*sql.Tx], error) {
	if service == nil {
		return nil, errors.New("preview worker requires a service")
	}
	if maxWorkers < 1 {
		maxWorkers = 1
	}
	workers := river.NewWorkers()
	river.AddWorker(workers, NewWorker(service))
	// A job is given longer than one render so a queued attempt is not killed
	// while LibreOffice is still inside its own timeout.
	jobTimeout := service.limits.Timeout + time.Minute
	return river.NewClient(riverdatabasesql.New(database), &river.Config{
		FetchPollInterval:    time.Second,
		JobTimeout:           jobTimeout,
		RescueStuckJobsAfter: jobTimeout + time.Minute,
		SoftStopTimeout:      6 * time.Second,
		Queues: map[string]river.QueueConfig{
			Queue: {MaxWorkers: maxWorkers},
		},
		Workers: workers,
	})
}

// NewInsertClient builds the insert-only client used by processes that commit
// revisions and schedule their previews.
func NewInsertClient(database *sql.DB) (*river.Client[*sql.Tx], error) {
	return river.NewClient(riverdatabasesql.New(database), &river.Config{})
}
