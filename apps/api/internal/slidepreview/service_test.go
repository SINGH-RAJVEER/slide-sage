package slidepreview

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
)

func TestServiceRenderStoresCompletePreviewSet(t *testing.T) {
	deck := []byte("canonical pptx bytes")
	repository := newMemoryPreviewRepository(revisionFor(deck, 3))
	objects := newMemoryObjectStore(revisionFor(deck, 3).ObjectKey, deck)
	service := newTestService(t, repository, objects, &stubRenderer{images: [][]byte{[]byte("one"), []byte("two"), []byte("three")}})

	if err := service.Render(context.Background(), "presentation-1", 4); err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	for index, want := range []string{"one", "two", "three"} {
		key := presentationrevision.PreviewObjectKey("presentation-1", 4, index)
		if got := string(objects.objects[key]); got != want {
			t.Fatalf("preview %d = %q, want %q", index, got, want)
		}
		if objects.contentTypes[key] != presentationrevision.PreviewContentType {
			t.Fatalf("preview %d content type = %q", index, objects.contentTypes[key])
		}
	}
	if repository.status != presentationrevision.PreviewReady || repository.readyCount != 3 {
		t.Fatalf("preview state = %q with %d images", repository.status, repository.readyCount)
	}
}

func TestServiceRenderSkipsRevisionItCannotClaim(t *testing.T) {
	deck := []byte("canonical pptx bytes")
	repository := newMemoryPreviewRepository(revisionFor(deck, 1))
	repository.claimable = false
	renderer := &stubRenderer{}
	service := newTestService(t, repository, newMemoryObjectStore("", nil), renderer)

	if err := service.Render(context.Background(), "presentation-1", 4); err != nil {
		t.Fatalf("Render() error = %v", err)
	}
	if renderer.calls != 0 {
		t.Fatalf("renderer calls = %d, want 0", renderer.calls)
	}
}

func TestServiceRenderRejectsPreviewCountMismatch(t *testing.T) {
	deck := []byte("canonical pptx bytes")
	repository := newMemoryPreviewRepository(revisionFor(deck, 3))
	objects := newMemoryObjectStore(revisionFor(deck, 3).ObjectKey, deck)
	service := newTestService(t, repository, objects, &stubRenderer{images: [][]byte{[]byte("one")}})

	err := service.Render(context.Background(), "presentation-1", 4)
	if !errors.Is(err, ErrSlideCountMismatch) {
		t.Fatalf("Render() error = %v, want ErrSlideCountMismatch", err)
	}
	if repository.status != presentationrevision.PreviewFailed {
		t.Fatalf("preview status = %q, want failed", repository.status)
	}
	if _, stored := objects.objects[presentationrevision.PreviewObjectKey("presentation-1", 4, 0)]; stored {
		t.Fatal("a mismatched render stored previews")
	}
}

func TestServiceRenderRejectsCorruptRevision(t *testing.T) {
	deck := []byte("canonical pptx bytes")
	revision := revisionFor(deck, 2)
	repository := newMemoryPreviewRepository(revision)
	objects := newMemoryObjectStore(revision.ObjectKey, []byte("different bytes here"))
	renderer := &stubRenderer{}
	service := newTestService(t, repository, objects, renderer)

	err := service.Render(context.Background(), "presentation-1", 4)
	if !errors.Is(err, ErrRevisionCorrupt) {
		t.Fatalf("Render() error = %v, want ErrRevisionCorrupt", err)
	}
	if renderer.calls != 0 {
		t.Fatalf("renderer calls = %d, want 0", renderer.calls)
	}
	if repository.status != presentationrevision.PreviewFailed {
		t.Fatalf("preview status = %q, want failed", repository.status)
	}
}

func TestServiceRenderReportsRendererFailure(t *testing.T) {
	deck := []byte("canonical pptx bytes")
	revision := revisionFor(deck, 1)
	repository := newMemoryPreviewRepository(revision)
	objects := newMemoryObjectStore(revision.ObjectKey, deck)
	service := newTestService(t, repository, objects, &stubRenderer{err: errors.New("soffice crashed")})

	err := service.Render(context.Background(), "presentation-1", 4)
	if !errors.Is(err, ErrRenderFailed) {
		t.Fatalf("Render() error = %v, want ErrRenderFailed", err)
	}
	if repository.status != presentationrevision.PreviewFailed {
		t.Fatalf("preview status = %q, want failed", repository.status)
	}
}

func TestServiceRenderKeepsClaimAfterCancellation(t *testing.T) {
	deck := []byte("canonical pptx bytes")
	revision := revisionFor(deck, 1)
	repository := newMemoryPreviewRepository(revision)
	objects := newMemoryObjectStore(revision.ObjectKey, deck)
	service := newTestService(t, repository, objects, &stubRenderer{err: context.Canceled})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if err := service.Render(ctx, "presentation-1", 4); err == nil {
		t.Fatal("Render() error = nil, want a render failure")
	}
	if repository.status != presentationrevision.PreviewRendering {
		t.Fatalf("preview status = %q, want the claim left in place", repository.status)
	}
}

func TestServiceRenderRejectsDeckOverSlideLimit(t *testing.T) {
	deck := []byte("canonical pptx bytes")
	revision := revisionFor(deck, 12)
	repository := newMemoryPreviewRepository(revision)
	service := newTestService(t, repository, newMemoryObjectStore(revision.ObjectKey, deck), &stubRenderer{})
	service.limits.MaxSlides = 10

	if err := service.Render(context.Background(), "presentation-1", 4); !errors.Is(err, ErrTooManySlides) {
		t.Fatalf("Render() error = %v, want ErrTooManySlides", err)
	}
}

func newTestService(t *testing.T, repository *memoryPreviewRepository, objects *memoryObjectStore, renderer Renderer) *Service {
	t.Helper()
	service, err := NewService(Config{Revisions: repository, Objects: objects, Renderer: renderer})
	if err != nil {
		t.Fatalf("NewService() error = %v", err)
	}
	return service
}

func revisionFor(deck []byte, slideCount int) presentationrevision.Revision {
	digest := sha256.Sum256(deck)
	digestString := hex.EncodeToString(digest[:])
	return presentationrevision.Revision{
		PresentationID: "presentation-1",
		Number:         4,
		ObjectKey:      fmt.Sprintf("presentations/presentation-1/objects/%s.pptx", digestString),
		SHA256:         digestString,
		ByteSize:       int64(len(deck)),
		SlideCount:     slideCount,
		MIMEType:       presentationrevision.PPTXContentType,
		PreviewStatus:  presentationrevision.PreviewPending,
	}
}

type stubRenderer struct {
	images [][]byte
	err    error
	calls  int
}

func (renderer *stubRenderer) Render(context.Context, []byte, Limits) ([][]byte, error) {
	renderer.calls++
	if renderer.err != nil {
		return nil, renderer.err
	}
	return renderer.images, nil
}

type memoryPreviewRepository struct {
	revision   presentationrevision.Revision
	claimable  bool
	status     presentationrevision.PreviewStatus
	readyCount int
}

func newMemoryPreviewRepository(revision presentationrevision.Revision) *memoryPreviewRepository {
	return &memoryPreviewRepository{revision: revision, claimable: true, status: revision.PreviewStatus}
}

func (repository *memoryPreviewRepository) ClaimPreviewRender(_ context.Context, presentationID string, number presentationrevision.RevisionNumber, _ time.Duration) (presentationrevision.Revision, bool, error) {
	if !repository.claimable || presentationID != repository.revision.PresentationID || number != repository.revision.Number {
		return presentationrevision.Revision{}, false, nil
	}
	repository.status = presentationrevision.PreviewRendering
	return repository.revision, true, nil
}

func (repository *memoryPreviewRepository) MarkPreviewsReady(_ context.Context, _ string, _ presentationrevision.RevisionNumber, count int) error {
	if repository.status != presentationrevision.PreviewRendering {
		return presentationrevision.ErrPreviewStateConflict
	}
	repository.status = presentationrevision.PreviewReady
	repository.readyCount = count
	return nil
}

func (repository *memoryPreviewRepository) MarkPreviewsFailed(context.Context, string, presentationrevision.RevisionNumber) error {
	if repository.status != presentationrevision.PreviewRendering {
		return presentationrevision.ErrPreviewStateConflict
	}
	repository.status = presentationrevision.PreviewFailed
	return nil
}

type memoryObjectStore struct {
	objects      map[string][]byte
	contentTypes map[string]string
}

func newMemoryObjectStore(key string, contents []byte) *memoryObjectStore {
	store := &memoryObjectStore{objects: map[string][]byte{}, contentTypes: map[string]string{}}
	if key != "" {
		store.objects[key] = contents
		store.contentTypes[key] = presentationrevision.PPTXContentType
	}
	return store
}

func (store *memoryObjectStore) OpenObject(_ context.Context, key string) (io.ReadCloser, error) {
	contents, ok := store.objects[key]
	if !ok {
		return nil, presentationrevision.ErrObjectNotFound
	}
	return io.NopCloser(bytes.NewReader(contents)), nil
}

func (store *memoryObjectStore) PutImmutable(_ context.Context, key string, body io.Reader, size int64, contentType, digest string) error {
	contents, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	if int64(len(contents)) != size {
		return presentationrevision.ErrObjectSizeMismatch
	}
	sum := sha256.Sum256(contents)
	if hex.EncodeToString(sum[:]) != digest {
		return presentationrevision.ErrObjectDigestMismatch
	}
	store.objects[key] = contents
	store.contentTypes[key] = contentType
	return nil
}
