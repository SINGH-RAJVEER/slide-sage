package templateasset

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func newThumbnailServer(t *testing.T, published func(string, int) bool, origin http.HandlerFunc) *http.ServeMux {
	t.Helper()
	upstream := httptest.NewTLSServer(origin)
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
	mux := http.NewServeMux()
	RegisterRoutes(mux, Handler{Fetcher: fetcher, Published: published})
	return mux
}

func requestThumbnail(mux *http.ServeMux, path string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, "/template-thumbnails/"+url.PathEscape(path), nil)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)
	return recorder
}

func TestThumbnailRouteSignsAndServesPublishedCover(t *testing.T) {
	cover := []byte("RIFF....WEBP")
	mux := newThumbnailServer(t, func(id string, version int) bool { return id == "brat" && version == 1 }, func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/pptx-templates/brat/1/thumbnails/cover.webp" {
			t.Errorf("request path = %q", request.URL.Path)
		}
		if request.URL.Query().Get("Signature") == "" {
			t.Error("request was not signed")
		}
		writer.Header().Set("Content-Type", ThumbnailContentType)
		_, _ = writer.Write(cover)
	})

	recorder := requestThumbnail(mux, "pptx-templates/brat/1/thumbnails/cover.webp")

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d", recorder.Code)
	}
	if recorder.Body.String() != string(cover) {
		t.Fatalf("body = %q", recorder.Body.String())
	}
	if got := recorder.Header().Get("Content-Type"); got != ThumbnailContentType {
		t.Errorf("Content-Type = %q", got)
	}
	if got := recorder.Header().Get("Cache-Control"); got != thumbnailCacheControl {
		t.Errorf("Cache-Control = %q", got)
	}
}

func TestThumbnailRouteRejectsPathsOutsideTheCoverPrefix(t *testing.T) {
	requests := 0
	mux := newThumbnailServer(t, func(string, int) bool { return true }, func(writer http.ResponseWriter, _ *http.Request) {
		requests++
		writer.Header().Set("Content-Type", ThumbnailContentType)
	})

	for _, path := range []string{
		"pptx-templates/brat/1/0e54f3a5/template.pptx",
		"pptx-templates/brat/../../secrets/cover.webp",
		"pptx-templates/brat/0/thumbnails/cover.webp",
		"other-prefix/brat/1/thumbnails/cover.webp",
	} {
		if code := requestThumbnail(mux, path).Code; code != http.StatusNotFound {
			t.Errorf("status for %q = %d, want 404", path, code)
		}
	}
	if requests != 0 {
		t.Fatalf("origin received %d requests, want 0", requests)
	}
}

func TestThumbnailRouteRefusesUnpublishedTemplates(t *testing.T) {
	mux := newThumbnailServer(t, func(string, int) bool { return false }, func(writer http.ResponseWriter, _ *http.Request) {
		t.Error("origin was called for an unpublished template")
		writer.Header().Set("Content-Type", ThumbnailContentType)
	})

	if code := requestThumbnail(mux, "pptx-templates/brat/1/thumbnails/cover.webp").Code; code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", code)
	}
}

func TestThumbnailRouteReportsOriginFailures(t *testing.T) {
	mux := newThumbnailServer(t, func(string, int) bool { return true }, func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusForbidden)
	})

	if code := requestThumbnail(mux, "pptx-templates/brat/1/thumbnails/cover.webp").Code; code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", code)
	}
}
