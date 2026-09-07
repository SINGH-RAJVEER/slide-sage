// Package presentationrevision commits immutable canonical PPTX revisions.
package presentationrevision

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"
)

const (
	PPTXContentType    = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	PreviewContentType = "image/webp"
)

// PreviewObjectKey names the preview image of one slide in one revision. Slide
// indexes are zero-based and follow package slide order. A revision is
// immutable, so a preview key always describes the same slide.
func PreviewObjectKey(presentationID string, number RevisionNumber, slideIndex int) string {
	return fmt.Sprintf("presentations/%s/revisions/%d/previews/%d.webp", presentationID, number, slideIndex)
}

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
	ErrObjectNotFound          = errors.New("object does not exist")
	ErrPreviewStateConflict    = errors.New("presentation revision no longer holds the preview claim")
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

// ObjectStore adds read access for callers that consume stored objects, such as
// the preview renderer and the download endpoint.
type ObjectStore interface {
	BlobStore
	// OpenObject returns ErrObjectNotFound when key holds no object.
	OpenObject(ctx context.Context, key string) (io.ReadCloser, error)
}

// PreviewRepository owns the preview lifecycle of a committed revision. Preview
// state is the only mutable part of a revision row.
type PreviewRepository interface {
	// ClaimPreviewRender marks a revision as rendering and returns it. It
	// returns false when previews are already ready or another worker holds a
	// claim that is younger than staleAfter.
	ClaimPreviewRender(ctx context.Context, presentationID string, number RevisionNumber, staleAfter time.Duration) (Revision, bool, error)
	// MarkPreviewsReady requires the full preview set, so count must equal the
	// revision slide count. It returns ErrPreviewStateConflict when the claim
	// was taken over in the meantime.
	MarkPreviewsReady(ctx context.Context, presentationID string, number RevisionNumber, count int) error
	MarkPreviewsFailed(ctx context.Context, presentationID string, number RevisionNumber) error
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
