package presentationrevision

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
	"unicode/utf8"

	"cloud.google.com/go/storage"
	"github.com/googleapis/gax-go/v2/apierror"
)

var errGCSObjectAlreadyExists = errors.New("GCS object already exists")

type GCSBlobStore struct {
	backend immutableGCSBackend
}

var _ BlobStore = (*GCSBlobStore)(nil)

func NewGCSBlobStore(ctx context.Context, bucket string) (*GCSBlobStore, error) {
	if strings.TrimSpace(bucket) == "" {
		return nil, errors.New("GCS bucket is required")
	}
	client, err := storage.NewClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("create GCS client: %w", err)
	}
	return &GCSBlobStore{backend: &googleStorageBackend{client: client, bucket: client.Bucket(bucket)}}, nil
}

func (store *GCSBlobStore) Close() error {
	return store.backend.Close()
}

func (store *GCSBlobStore) PutImmutable(ctx context.Context, key string, body io.Reader, size int64, contentType, sha256 string) error {
	if err := validateObjectWrite(key, body, size, contentType, sha256); err != nil {
		return err
	}
	err := store.backend.Create(ctx, key, body, size, contentType, sha256)
	if err == nil {
		return nil
	}
	if !errors.Is(err, errGCSObjectAlreadyExists) {
		return fmt.Errorf("create immutable GCS object: %w", err)
	}
	attributes, err := store.backend.Attributes(ctx, key)
	if err != nil {
		return fmt.Errorf("inspect existing GCS object: %w", err)
	}
	if attributes.Size != size || attributes.ContentType != contentType || attributes.SHA256 != sha256 {
		return ErrImmutableObjectConflict
	}
	return nil
}

func validateObjectWrite(key string, body io.Reader, size int64, contentType, sha256 string) error {
	if key == "" || key == "." || key == ".." || !utf8.ValidString(key) || len([]byte(key)) > 1024 || strings.HasPrefix(key, "/") ||
		strings.HasPrefix(key, ".well-known/acme-challenge/") || strings.ContainsAny(key, "\\\r\n") ||
		path.Clean(key) != key || strings.HasPrefix(key, "../") {
		return errors.New("invalid GCS object key")
	}
	if body == nil {
		return errors.New("object body is required")
	}
	if size <= 0 {
		return errors.New("object size must be positive")
	}
	if strings.TrimSpace(contentType) == "" {
		return errors.New("object content type is required")
	}
	if !validSHA256(sha256) {
		return errors.New("valid object SHA-256 is required")
	}
	return nil
}

type gcsObjectAttributes struct {
	Size        int64
	ContentType string
	SHA256      string
}

type immutableGCSBackend interface {
	Create(context.Context, string, io.Reader, int64, string, string) error
	Attributes(context.Context, string) (gcsObjectAttributes, error)
	Close() error
}

type googleStorageBackend struct {
	client *storage.Client
	bucket *storage.BucketHandle
}

func (backend *googleStorageBackend) Create(ctx context.Context, key string, body io.Reader, size int64, contentType, sha256 string) error {
	uploadContext, cancelUpload := context.WithCancel(ctx)
	defer cancelUpload()
	object := backend.bucket.Object(key).If(storage.Conditions{DoesNotExist: true})
	writer := object.NewWriter(uploadContext)
	writer.ContentType = contentType
	writer.CacheControl = "private, no-store"
	writer.Metadata = map[string]string{"sha256": sha256}

	err := copyExactObject(writer, body, size, sha256)
	if err != nil {
		cancelUpload()
		_ = writer.Close()
		if isPreconditionFailure(err) {
			return errGCSObjectAlreadyExists
		}
		return err
	}
	if err := writer.Close(); err != nil {
		if isPreconditionFailure(err) {
			return errGCSObjectAlreadyExists
		}
		return err
	}
	return nil
}

func copyExactObject(destination io.Writer, body io.Reader, size int64, expectedSHA256 string) error {
	digest := sha256.New()
	hashed := &countingWriter{destination: digest}
	_, err := io.Copy(io.MultiWriter(hashed, destination), io.LimitReader(body, size+1))
	if err != nil {
		if !isPreconditionFailure(err) {
			return err
		}
		remaining := size + 1 - hashed.written
		if remaining > 0 {
			if _, drainErr := io.Copy(hashed, io.LimitReader(body, remaining)); drainErr != nil {
				return drainErr
			}
		}
	}
	if hashed.written != size {
		return ErrObjectSizeMismatch
	}
	if hex.EncodeToString(digest.Sum(nil)) != expectedSHA256 {
		return ErrObjectDigestMismatch
	}
	return err
}

type countingWriter struct {
	destination io.Writer
	written     int64
}

func (writer *countingWriter) Write(value []byte) (int, error) {
	written, err := writer.destination.Write(value)
	writer.written += int64(written)
	return written, err
}

func (backend *googleStorageBackend) Attributes(ctx context.Context, key string) (gcsObjectAttributes, error) {
	attributes, err := backend.bucket.Object(key).Attrs(ctx)
	if err != nil {
		return gcsObjectAttributes{}, err
	}
	return gcsObjectAttributes{
		Size:        attributes.Size,
		ContentType: attributes.ContentType,
		SHA256:      attributes.Metadata["sha256"],
	}, nil
}

func (backend *googleStorageBackend) Close() error {
	return backend.client.Close()
}

func isPreconditionFailure(err error) bool {
	apiErr, ok := apierror.FromError(err)
	return ok && apiErr.HTTPCode() == 412
}
