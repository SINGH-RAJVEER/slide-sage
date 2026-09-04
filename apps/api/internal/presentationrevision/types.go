// Package presentationrevision commits immutable canonical PPTX revisions.
package presentationrevision

import (
	"context"
	"errors"
	"io"
	"time"
)

const PPTXContentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"

var (
	ErrInvalidCommit           = errors.New("invalid presentation revision commit")
	ErrInvalidPPTX             = errors.New("invalid PPTX package")
	ErrImmutableObjectConflict = errors.New("immutable object contains different content")
	ErrObjectDigestMismatch    = errors.New("object SHA-256 does not match the declared digest")
	ErrObjectSizeMismatch      = errors.New("object size does not match the declared size")
	ErrPackageTooLarge         = errors.New("PPTX package exceeds the byte limit")
	ErrPresentationNotFound    = errors.New("presentation not found")
	ErrRevisionConflict        = errors.New("presentation revision conflict")
	ErrSlideCountMismatch      = errors.New("PPTX slide count does not match the expected count")
)

type RevisionNumber int

type SourceOperationKind string

const (
	SourceOperationGeneration SourceOperationKind = "generation"
	SourceOperationAIRevision SourceOperationKind = "ai_revision"
	SourceOperationEditorSave SourceOperationKind = "editor_save"
	SourceOperationImport     SourceOperationKind = "import"
)

func (kind SourceOperationKind) valid() bool {
	switch kind {
	case SourceOperationGeneration, SourceOperationAIRevision, SourceOperationEditorSave, SourceOperationImport:
		return true
	default:
		return false
	}
}

type SourceOperation struct {
	ID   string
	Kind SourceOperationKind
}

type PreviewStatus string

const (
	PreviewPending   PreviewStatus = "pending"
	PreviewRendering PreviewStatus = "rendering"
	PreviewReady     PreviewStatus = "ready"
	PreviewFailed    PreviewStatus = "failed"
)

// Revision is immutable after RevisionRepository.CommitRevision succeeds.
type Revision struct {
	PresentationID  string
	Number          RevisionNumber
	ObjectKey       string
	SHA256          string
	ByteSize        int64
	SlideCount      int
	MIMEType        string
	AuthorID        string
	SourceOperation SourceOperation
	PreviewStatus   PreviewStatus
	PreviewCount    int
	TemplateID      string
	TemplateVersion int
	TemplateSHA256  string
	CompilerVersion string
	EditorProvider  string
	BaseRevision    *RevisionNumber
	CreatedAt       time.Time
}

type CommitInput struct {
	PresentationID     string
	AuthorID           string
	Operation          SourceOperation
	ExpectedRevision   RevisionNumber
	ExpectedSlideCount int
	PPTX               io.Reader
	MIMEType           string
	TemplateID         string
	TemplateVersion    int
	TemplateSHA256     string
	CompilerVersion    string
	EditorProvider     string
	BaseRevision       *RevisionNumber
}

type BlobStore interface {
	// PutImmutable is idempotent when key already contains identical bytes. It
	// returns an error when the key contains different bytes.
	PutImmutable(ctx context.Context, key string, body io.Reader, size int64, contentType, sha256 string) error
}

type RepositoryCommit struct {
	Revision  Revision
	Duplicate bool
	Advanced  bool
}

type RevisionRepository interface {
	FindByOperation(ctx context.Context, presentationID, operationID string) (Revision, bool, error)
	FindRevision(ctx context.Context, presentationID string, number RevisionNumber) (Revision, bool, error)
	CurrentRevision(ctx context.Context, presentationID string) (RevisionNumber, error)
	// CommitRevision atomically checks the operation ID, allocates the next
	// presentation revision number, inserts the revision, and advances the
	// current pointer when its compare-and-swap succeeds. Stale editor saves are
	// inserted without advancing the pointer; other stale operations conflict.
	CommitRevision(ctx context.Context, expected RevisionNumber, revision Revision) (RepositoryCommit, error)
}
