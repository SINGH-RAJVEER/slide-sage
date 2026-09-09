package templateasset

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatecatalog"
)

func TestTemplatePreviewsUsePublishedDigestAndSignedCDN(t *testing.T) {
	digest := strings.Repeat("a", 64)
	t.Cleanup(templatecatalog.Swap([]templatecatalog.Entry{{ID: "brat", Version: 1, SHA256: digest}}))
	requests := 0
	mux := newThumbnailServer(t, func(string, int) bool { return true }, func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Query().Get("Signature") == "" {
			t.Error("missing CDN signature")
		}
		prefix := "/pptx-templates/brat/1/" + digest + "/previews/v1/"
		switch r.URL.Path {
		case prefix + "manifest.json":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"slideCount":2}`))
		case prefix + "1.webp":
			w.Header().Set("Content-Type", ThumbnailContentType)
			_, _ = w.Write([]byte("RIFF....WEBP"))
		default:
			t.Errorf("unexpected CDN path %s", r.URL.Path)
			w.WriteHeader(404)
		}
	})
	for _, url := range []string{"/template-previews/brat/1", "/template-previews/brat/1/" + digest + "/1"} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("GET", url, nil))
		if w.Code != 200 {
			t.Fatalf("%s: %d %s", url, w.Code, w.Body.String())
		}
	}
	for _, url := range []string{"/template-previews/unpublished/1", "/template-previews/brat/0", "/template-previews/brat/1/" + strings.Repeat("b", 64) + "/1", "/template-previews/brat/1/" + digest + "/-1", "/template-previews/brat/1/" + digest + "/200"} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("GET", url, nil))
		if w.Code != 404 {
			t.Errorf("%s: %d", url, w.Code)
		}
	}
	if requests != 2 {
		t.Errorf("unexpected upstream requests: %d", requests)
	}
}

func TestTemplatePreviewRejectsInvalidManifest(t *testing.T) {
	t.Cleanup(templatecatalog.Swap([]templatecatalog.Entry{{ID: "brat", Version: 1, SHA256: strings.Repeat("a", 64)}}))
	mux := newThumbnailServer(t, func(string, int) bool { return true }, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"slideCount":999999}`))
	})
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("GET", "/template-previews/brat/1", nil))
	if w.Code != 502 {
		t.Fatalf("status %d", w.Code)
	}
}

// PreviewExists is what publish-templates -verify relies on to notice a
// template whose package is published but whose previews never were.
func TestPreviewExistsReportsWhetherThePreviewSetResolved(t *testing.T) {
	digest := strings.Repeat("a", 64)
	asset := Asset{ID: "brat", Version: 1, SHA256: digest}
	published := true
	upstream := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/pptx-templates/brat/1/"+digest+"/previews/v1/manifest.json" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		if !published {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", PreviewManifestContentType)
	}))
	t.Cleanup(upstream.Close)
	fetcher, err := NewCDNFetcher(CDNFetcherConfig{
		BaseURL:           upstream.URL,
		KeyName:           "templates-key-v1",
		KeySecret:         base64.RawURLEncoding.EncodeToString([]byte("0123456789abcdef")),
		Client:            upstream.Client(),
		allowExplicitPort: true,
	})
	if err != nil {
		t.Fatalf("NewCDNFetcher() error = %v", err)
	}
	if err := fetcher.PreviewExists(context.Background(), asset); err != nil {
		t.Fatalf("published previews reported missing: %v", err)
	}
	published = false
	if err := fetcher.PreviewExists(context.Background(), asset); err == nil {
		t.Fatal("missing previews reported as published")
	}
	if err := fetcher.PreviewExists(context.Background(), Asset{ID: "brat", Version: 1, SHA256: "short"}); err == nil {
		t.Fatal("invalid asset accepted")
	}
}
