package presentationrevision

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"google.golang.org/api/googleapi"
)

func TestGCSBlobStoreCreatesImmutableObject(t *testing.T) {
	backend := &fakeGCSBackend{}
	store := &GCSBlobStore{backend: backend}
	body := []byte("canonical pptx")
	digest := strings.Repeat("a", 64)

	err := store.PutImmutable(context.Background(), "presentations/one/objects/deck.pptx", bytes.NewReader(body), int64(len(body)), PPTXContentType, digest)
	if err != nil {
		t.Fatalf("PutImmutable() error = %v", err)
	}
	if backend.key != "presentations/one/objects/deck.pptx" || !bytes.Equal(backend.body, body) || backend.sha256 != digest {
		t.Fatalf("created object = %+v", backend)
	}
}

func TestCopyExactObjectValidatesSizeAndDigest(t *testing.T) {
	body := []byte("canonical pptx")
	digest := "3131d50475f69152e122cb94ccc4fa9457ea49ac424618f833638b54b0fcf2d3"
	var destination bytes.Buffer
	if err := copyExactObject(&destination, bytes.NewReader(body), int64(len(body)), digest); err != nil {
		t.Fatalf("copyExactObject() error = %v", err)
	}
	if !bytes.Equal(destination.Bytes(), body) {
		t.Fatal("copyExactObject() wrote different bytes")
	}

	if err := copyExactObject(io.Discard, strings.NewReader("pptx"), 3, strings.Repeat("a", 64)); !errors.Is(err, ErrObjectSizeMismatch) {
		t.Fatalf("copyExactObject() size error = %v", err)
	}
	if err := copyExactObject(io.Discard, strings.NewReader("pptx"), 4, strings.Repeat("a", 64)); !errors.Is(err, ErrObjectDigestMismatch) {
		t.Fatalf("copyExactObject() digest error = %v", err)
	}
}

func TestCopyExactObjectFinishesDigestAfterPreconditionFailure(t *testing.T) {
	body := []byte("canonical pptx")
	digest := "3131d50475f69152e122cb94ccc4fa9457ea49ac424618f833638b54b0fcf2d3"
	destination := &failingWriter{err: &googleapi.Error{Code: 412}}

	err := copyExactObject(destination, bytes.NewReader(body), int64(len(body)), digest)
	if !isPreconditionFailure(err) {
		t.Fatalf("copyExactObject() error = %v, want precondition failure", err)
	}
	err = copyExactObject(destination, bytes.NewReader([]byte("different bytes")), int64(len("different bytes")), digest)
	if !errors.Is(err, ErrObjectDigestMismatch) {
		t.Fatalf("copyExactObject() mismatch error = %v, want ErrObjectDigestMismatch", err)
	}
}

func TestGCSBlobStoreAcceptsIdenticalExistingObject(t *testing.T) {
	digest := strings.Repeat("a", 64)
	backend := &fakeGCSBackend{
		createError: errGCSObjectAlreadyExists,
		attributes:  gcsObjectAttributes{Size: 4, ContentType: PPTXContentType, SHA256: digest},
	}
	store := &GCSBlobStore{backend: backend}

	if err := store.PutImmutable(context.Background(), "deck.pptx", strings.NewReader("pptx"), 4, PPTXContentType, digest); err != nil {
		t.Fatalf("PutImmutable() error = %v", err)
	}
}

func TestGCSBlobStoreRejectsDifferentExistingObject(t *testing.T) {
	backend := &fakeGCSBackend{
		createError: errGCSObjectAlreadyExists,
		attributes:  gcsObjectAttributes{Size: 5, ContentType: PPTXContentType, SHA256: strings.Repeat("b", 64)},
	}
	store := &GCSBlobStore{backend: backend}

	err := store.PutImmutable(context.Background(), "deck.pptx", strings.NewReader("pptx"), 4, PPTXContentType, strings.Repeat("a", 64))
	if !errors.Is(err, ErrImmutableObjectConflict) {
		t.Fatalf("PutImmutable() error = %v, want ErrImmutableObjectConflict", err)
	}
}

func TestGCSBlobStoreRejectsInvalidWriteBeforeGCS(t *testing.T) {
	backend := &fakeGCSBackend{}
	store := &GCSBlobStore{backend: backend}

	err := store.PutImmutable(context.Background(), "../deck.pptx", strings.NewReader("pptx"), 4, PPTXContentType, strings.Repeat("a", 64))
	if err == nil {
		t.Fatal("PutImmutable() error = nil")
	}
	if backend.createCalls != 0 {
		t.Fatalf("GCS create calls = %d, want 0", backend.createCalls)
	}
}

func TestGCSBlobStorePropagatesCreateFailure(t *testing.T) {
	want := errors.New("GCS unavailable")
	store := &GCSBlobStore{backend: &fakeGCSBackend{createError: want}}

	err := store.PutImmutable(context.Background(), "deck.pptx", strings.NewReader("pptx"), 4, PPTXContentType, strings.Repeat("a", 64))
	if !errors.Is(err, want) {
		t.Fatalf("PutImmutable() error = %v, want wrapped create error", err)
	}
}

type fakeGCSBackend struct {
	key             string
	body            []byte
	contentType     string
	sha256          string
	createCalls     int
	createError     error
	attributes      gcsObjectAttributes
	attributesError error
}

type failingWriter struct {
	err error
}

func (writer *failingWriter) Write([]byte) (int, error) {
	return 0, writer.err
}

func (backend *fakeGCSBackend) Create(_ context.Context, key string, body io.Reader, _ int64, contentType, sha256 string) error {
	backend.createCalls++
	backend.key = key
	backend.contentType = contentType
	backend.sha256 = sha256
	backend.body, _ = io.ReadAll(body)
	return backend.createError
}

func (backend *fakeGCSBackend) Attributes(context.Context, string) (gcsObjectAttributes, error) {
	return backend.attributes, backend.attributesError
}

func (backend *fakeGCSBackend) Close() error {
	return nil
}
