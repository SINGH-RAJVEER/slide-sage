package auth

import (
	"testing"
	"time"
)

func TestOAuthStateRoundTrip(t *testing.T) {
	service := &Service{config: Config{AuthSecret: "test-secret-with-at-least-thirty-two-characters"}}
	input := oauthState{Provider: "google", CallbackURL: "https://slidesage.app/library", ExpiresAt: time.Now().Add(time.Minute).Unix()}
	encoded, err := service.encodeOAuthState(input)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := service.decodeOAuthState(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if decoded != input {
		t.Fatalf("got %#v", decoded)
	}
	if _, err := service.decodeOAuthState(encoded + "x"); err == nil {
		t.Fatal("tampered state was accepted")
	}
}

func TestSafeCallbackURL(t *testing.T) {
	service := &Service{config: Config{TrustedOrigins: []string{"https://slidesage.app"}}}
	if _, err := service.safeCallbackURL("https://slidesage.app/presentations"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.safeCallbackURL("https://attacker.example/"); err == nil {
		t.Fatal("untrusted callback accepted")
	}
}
