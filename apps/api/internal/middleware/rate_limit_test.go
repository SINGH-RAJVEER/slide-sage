package middleware

import (
	"net/http"
	"testing"
	"time"
)

func TestPolicyForGeneration(t *testing.T) {
	policy, ok := policyFor(http.MethodPost, "/generate-presentation-stream")
	if !ok || policy.limit != 6 || policy.window != time.Minute || !policy.authenticated {
		t.Fatalf("policy: %#v", policy)
	}
	if _, ok := policyFor(http.MethodGet, "/health"); ok {
		t.Fatal("health route should not be rate limited")
	}
}

func TestHashKeyIsScopedAndStable(t *testing.T) {
	first := hashKey("secret", "scope-a", "identity")
	if len(first) != 64 || first != hashKey("secret", "scope-a", "identity") {
		t.Fatalf("hash: %q", first)
	}
	if first == hashKey("secret", "scope-b", "identity") {
		t.Fatal("scope did not affect hash")
	}
}
