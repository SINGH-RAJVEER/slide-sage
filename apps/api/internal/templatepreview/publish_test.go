package templatepreview

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/slidepreview"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templateasset"
)

type rendererStub struct{ images [][]byte }

func (r rendererStub) Render(context.Context, []byte, slidepreview.Limits) ([][]byte, error) {
	return r.images, nil
}

type uploadStub struct {
	keys  []string
	mimes []string
	fail  bool
}

func (s *uploadStub) PutImmutable(_ context.Context, k string, _ io.Reader, _ int64, mime string, _ string) error {
	if s.fail {
		return errors.New("upload failed")
	}
	s.keys = append(s.keys, k)
	s.mimes = append(s.mimes, mime)
	return nil
}

func TestPublicationRequiresCompleteDeck(t *testing.T) {
	asset := templateasset.Asset{ID: "brat", Version: 1, SHA256: strings.Repeat("a", 64)}
	for _, fail := range []bool{false, true} {
		store := &uploadStub{fail: fail}
		err := Publish(context.Background(), store, rendererStub{[][]byte{[]byte("one"), []byte("two")}}, asset, []byte("pptx"), 2)
		if fail {
			if err == nil || len(store.keys) != 0 {
				t.Fatal("failed upload published a manifest")
			}
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		if len(store.keys) != 3 || !strings.HasSuffix(store.keys[2], "/manifest.json") {
			t.Fatalf("order %v", store.keys)
		}
	}
	store := &uploadStub{}
	if err := Publish(context.Background(), store, rendererStub{[][]byte{[]byte("one")}}, asset, nil, 2); err == nil || len(store.keys) != 0 {
		t.Fatal("short deck published")
	}
}

// The CDN fetcher rejects any object whose media type is not an exact match, so
// a preview set uploaded under the wrong type is unreadable even when present.
func TestPublicationSetsTheContentTypesTheFetcherRequires(t *testing.T) {
	asset := templateasset.Asset{ID: "brat", Version: 1, SHA256: strings.Repeat("a", 64)}
	store := &uploadStub{}
	if err := Publish(context.Background(), store, rendererStub{[][]byte{[]byte("one"), []byte("two")}}, asset, []byte("pptx"), 2); err != nil {
		t.Fatal(err)
	}
	want := []string{templateasset.ThumbnailContentType, templateasset.ThumbnailContentType, templateasset.PreviewManifestContentType}
	for index, mime := range want {
		if store.mimes[index] != mime {
			t.Errorf("%s uploaded as %q, want %q", store.keys[index], store.mimes[index], mime)
		}
	}
}

// A preview set is addressed by the package digest, so previews published for
// one version can never be served for another.
func TestPublicationKeysPreviewsByDigest(t *testing.T) {
	store := &uploadStub{}
	asset := templateasset.Asset{ID: "brat", Version: 2, SHA256: strings.Repeat("b", 64)}
	if err := Publish(context.Background(), store, rendererStub{[][]byte{[]byte("one")}}, asset, []byte("pptx"), 1); err != nil {
		t.Fatal(err)
	}
	prefix := "pptx-templates/brat/2/" + strings.Repeat("b", 64) + "/previews/v1/"
	if store.keys[0] != prefix+"0.webp" || store.keys[1] != prefix+"manifest.json" {
		t.Fatalf("keys %v", store.keys)
	}
}
