package middleware

import (
	"net/http"
	"testing"
	"time"
)

func TestPolicyForGeneration(t *testing.T) {
	policy, ok := policyFor(http.MethodPost, "/presentation-jobs")
	if !ok || policy.limit != 15 || policy.window != time.Minute || !policy.authenticated {
		t.Fatalf("policy: %#v", policy)
	}
	if _, ok := policyFor(http.MethodGet, "/health"); ok {
		t.Fatal("health route should not be rate limited")
	}
}

func TestPolicyForAvatarMutation(t *testing.T) {
	for _, path := range []string{"/profile/avatar", "/profile/avatar/upload"} {
		policy, ok := policyFor(http.MethodPost, path)
		if !ok || policy.scope != "profile-mutation" || policy.limit != 10 || policy.window != 15*time.Minute || !policy.authenticated {
			t.Fatalf("policy for %s: %#v", path, policy)
		}
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
