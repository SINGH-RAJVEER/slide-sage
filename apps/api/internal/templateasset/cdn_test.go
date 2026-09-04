package templateasset

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCDNFetcherSignsAndVerifiesTemplate(t *testing.T) {
	contents := []byte("canonical template")
	digest := sha256.Sum256(contents)
	key := []byte("0123456789abcdef")
	keySecret := base64.RawURLEncoding.EncodeToString(key)
	expires := time.Date(2026, time.September, 4, 12, 15, 0, 0, time.UTC)

	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		wantPath := "/assets/pptx-templates/template/1/" + hex.EncodeToString(digest[:]) + "/template.pptx"
		if request.URL.Path != wantPath {
			t.Errorf("request path = %q", request.URL.Path)
		}
		query := request.URL.RawQuery
		signatureMarker := "&Signature="
		markerIndex := strings.LastIndex(query, signatureMarker)
		if markerIndex < 0 {
			t.Fatal("request has no Signature parameter")
		}
		unsigned := "https://" + request.Host + request.URL.Path + "?" + query[:markerIndex]
		mac := hmac.New(sha1.New, key)
		_, _ = io.WriteString(mac, unsigned)
		wantSignature := base64.URLEncoding.EncodeToString(mac.Sum(nil))
		if query[markerIndex+len(signatureMarker):] != wantSignature {
			t.Errorf("Signature = %q, want %q", query[markerIndex+len(signatureMarker):], wantSignature)
		}
		if query[:markerIndex] != "Expires=1788524100&KeyName=templates-key-v1" {
			t.Errorf("signed policy = %q", query[:markerIndex])
		}
		writer.Header().Set("Content-Type", PPTXContentType)
		_, _ = writer.Write(contents)
	}))
	defer server.Close()

	fetcher, err := NewCDNFetcher(CDNFetcherConfig{
		BaseURL:           server.URL + "/assets/",
		KeyName:           "templates-key-v1",
		KeySecret:         keySecret,
		Client:            server.Client(),
		allowExplicitPort: true,
	})
	if err != nil {
		t.Fatalf("NewCDNFetcher() error = %v", err)
	}
	fetcher.now = func() time.Time { return expires.Add(-DefaultSignedURLTTL) }
	asset := Asset{ID: "template", Version: 1, SHA256: hex.EncodeToString(digest[:])}

	result, err := fetcher.Fetch(context.Background(), asset)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if string(result) != string(contents) {
		t.Fatalf("Fetch() = %q", result)
	}
}

func TestCDNFetcherRejectsInvalidConfiguration(t *testing.T) {
	_, err := NewCDNFetcher(CDNFetcherConfig{BaseURL: "http://cdn.example.com", KeyName: "key", KeySecret: "missing"})
	if err == nil {
		t.Fatal("NewCDNFetcher() error = nil")
	}
	_, err = NewCDNFetcher(CDNFetcherConfig{
		BaseURL:   "https://cdn.example.com",
		KeyName:   "key",
		KeySecret: base64.RawURLEncoding.EncodeToString([]byte("too short")),
	})
	if err == nil {
		t.Fatal("NewCDNFetcher() short-key error = nil")
	}
}

func TestCDNFetcherRejectsUntrustedResponse(t *testing.T) {
	tests := []struct {
		name        string
		contents    string
		contentType string
		maxBytes    int64
		want        error
	}{
		{name: "digest", contents: "different", contentType: PPTXContentType, want: ErrDigestMismatch},
		{name: "content type", contents: "pptx", contentType: "application/octet-stream", want: ErrUnexpectedType},
		{name: "size", contents: "oversized", contentType: PPTXContentType, maxBytes: 4, want: ErrAssetTooLarge},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				writer.Header().Set("Content-Type", test.contentType)
				_, _ = io.WriteString(writer, test.contents)
			}))
			defer server.Close()
			fetcher, err := NewCDNFetcher(CDNFetcherConfig{
				BaseURL:           server.URL,
				KeyName:           "key",
				KeySecret:         base64.RawURLEncoding.EncodeToString([]byte("0123456789abcdef")),
				MaxBytes:          test.maxBytes,
				Client:            server.Client(),
				allowExplicitPort: true,
			})
			if err != nil {
				t.Fatalf("NewCDNFetcher() error = %v", err)
			}
			digest := sha256.Sum256([]byte("pptx"))
			_, err = fetcher.Fetch(context.Background(), Asset{ID: "template", Version: 1, SHA256: hex.EncodeToString(digest[:])})
			if !errors.Is(err, test.want) {
				t.Fatalf("Fetch() error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestCDNFetcherRejectsRedirect(t *testing.T) {
	targetRequests := 0
	server := httptest.NewTLSServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/target" {
			targetRequests++
			writer.Header().Set("Content-Type", PPTXContentType)
			_, _ = io.WriteString(writer, "pptx")
			return
		}
		http.Redirect(writer, request, "/target", http.StatusFound)
	}))
	defer server.Close()
	fetcher, err := NewCDNFetcher(CDNFetcherConfig{
		BaseURL:           server.URL,
		KeyName:           "key",
		KeySecret:         base64.RawURLEncoding.EncodeToString([]byte("0123456789abcdef")),
		Client:            server.Client(),
		allowExplicitPort: true,
	})
	if err != nil {
		t.Fatalf("NewCDNFetcher() error = %v", err)
	}
	digest := sha256.Sum256([]byte("pptx"))
	if _, err := fetcher.Fetch(context.Background(), Asset{ID: "template", Version: 1, SHA256: hex.EncodeToString(digest[:])}); err == nil {
		t.Fatal("Fetch() redirect error = nil")
	}
	if targetRequests != 0 {
		t.Fatalf("redirect target requests = %d, want 0", targetRequests)
	}
}
