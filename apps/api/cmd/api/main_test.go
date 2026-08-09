package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSecurityRejectsUnsafeUntrustedOrigin(t *testing.T) {
	t.Setenv("CORS_ORIGINS", "https://slidesage.app")
	handler := withSecurity(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) { writer.WriteHeader(http.StatusNoContent) }))
	request := httptest.NewRequest(http.MethodPost, "/profile", nil)
	request.Header.Set("Origin", "https://attacker.example")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("status = %d", response.Code)
	}
}

func TestSecuritySetsCredentialedCORSHeaders(t *testing.T) {
	t.Setenv("CORS_ORIGINS", "https://slidesage.app")
	handler := withSecurity(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) { writer.WriteHeader(http.StatusNoContent) }))
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	request.Header.Set("Origin", "https://slidesage.app")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Header().Get("Access-Control-Allow-Origin") != "https://slidesage.app" {
		t.Fatalf("headers: %#v", response.Header())
	}
	if response.Header().Get("Access-Control-Allow-Headers") != "Content-Type, Authorization, Idempotency-Key, Last-Event-ID" {
		t.Fatalf("allowed headers: %q", response.Header().Get("Access-Control-Allow-Headers"))
	}
	if response.Header().Get("Access-Control-Expose-Headers") != "X-Generation-Job-ID, X-Presentation-ID" {
		t.Fatalf("exposed headers: %q", response.Header().Get("Access-Control-Expose-Headers"))
	}
}
