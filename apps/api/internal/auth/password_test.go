package auth

import (
	"strings"
	"testing"
)

func TestVerifyPasswordSupportsBetterAuthScrypt(t *testing.T) {
	hash := "724139109330a29d64d3275159912c20:42699d3cc81f91c78053b7de1b635cf2203e2f376449b143ddb63fd7290d1bd490fba30d7bcc24de58bd8582a7cbcffca949c248dedd322e6233a1f704e3113b"
	if !verifyPassword(hash, "Pässword123!") {
		t.Fatal("expected Better Auth hash to verify")
	}
	if verifyPassword(hash, "wrong password") {
		t.Fatal("wrong password verified")
	}
}

func TestHashPasswordUsesBetterAuthFormat(t *testing.T) {
	hash, err := hashPassword("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(hash, ":")
	if len(parts) != 2 || len(parts[0]) != 32 || len(parts[1]) != 128 {
		t.Fatalf("unexpected hash format: %q", hash)
	}
	if !verifyPassword(hash, "correct horse battery staple") {
		t.Fatal("generated hash did not verify")
	}
}

func TestSignedCookieRoundTrip(t *testing.T) {
	service := &Service{config: Config{AuthSecret: "test-secret-with-at-least-thirty-two-characters"}}
	signed := service.signCookieValue("session-token")
	if token := service.verifyCookieValue(signed); token != "session-token" {
		t.Fatalf("got %q", token)
	}
	if token := service.verifyCookieValue(signed + "tampered"); token != "" {
		t.Fatal("tampered cookie verified")
	}
}
