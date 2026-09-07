// Package officeeditor integrates ONLYOFFICE Docs as the browser editor for
// canonical PPTX revisions.
//
// SlideSage never edits the package itself here. The editor returns a complete
// PPTX, which is committed as a new immutable revision under the same conflict
// rules as generation and AI revisions.
package officeeditor

import (
	"context"
	"errors"
	"regexp"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
)

const (
	// Provider is recorded on every revision this package commits.
	Provider = "onlyoffice"

	documentType = "slide"
	fileType     = "pptx"

	DefaultSourceTokenTTL = 5 * time.Minute
	DefaultMaxSaveBytes   = int64(64 << 20)
	maxCallbackBodyBytes  = int64(64 << 10)
)

// ONLYOFFICE callback statuses. Only the two save statuses produce a revision.
const (
	statusEditing        = 1
	statusSaveReady      = 2
	statusSaveFailed     = 3
	statusClosedNoChange = 4
	statusForceSave      = 6
	statusForceSaveError = 7
)

var (
	ErrEditorUnavailable   = errors.New("the presentation editor is not configured")
	ErrPresentationMissing = errors.New("presentation not found")
	ErrNotEditable         = errors.New("presentation has no PPTX revision to edit")
	ErrInvalidToken        = errors.New("invalid editor token")
	ErrInvalidCallback     = errors.New("invalid editor callback")
	ErrUntrustedResult     = errors.New("editor result URL is not the document server")
	ErrSaveTooLarge        = errors.New("editor save exceeds the byte limit")
)

// documentKeyPattern matches the character set ONLYOFFICE accepts for document
// keys.
var documentKeyPattern = regexp.MustCompile(`^[0-9a-zA-Z._=-]{1,128}$`)

// Presentation carries only what the editor needs to identify a document.
type Presentation struct {
	ID       string
	OwnerID  string
	Title    string
	Revision presentationrevision.RevisionNumber
}

type PresentationLookup interface {
	// OwnedPresentation returns false when the presentation does not exist or
	// belongs to another user.
	OwnedPresentation(ctx context.Context, presentationID, userID string) (Presentation, bool, error)
	// Presentation resolves a document without a user session, for callbacks
	// that are authenticated by the document server signature instead.
	Presentation(ctx context.Context, presentationID string) (Presentation, bool, error)
}

type RevisionReader interface {
	FindRevision(ctx context.Context, presentationID string, number presentationrevision.RevisionNumber) (presentationrevision.Revision, bool, error)
}

type DocumentCommitter interface {
	Commit(ctx context.Context, input presentationrevision.CommitInput) (presentationrevision.RepositoryCommit, error)
}

// PreviewScheduler renders the committed save into viewer images. A scheduling
// failure never fails the save: the deck is already downloadable.
type PreviewScheduler interface {
	SchedulePreviews(ctx context.Context, presentationID string, number presentationrevision.RevisionNumber) error
}
