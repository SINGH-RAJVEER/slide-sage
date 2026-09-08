package presentation

import (
	"strings"
	"testing"
)

func TestParseResearchPayloadRejectsUnsafeURL(t *testing.T) {
	_, err := ParseResearchPayload(map[string]any{"sources": []any{map[string]any{"url": "javascript:alert(1)"}}})
	if err == nil {
		t.Fatal("unsafe URL accepted")
	}
}

func TestParseTemplateReferenceReadsAnOptionalDigest(t *testing.T) {
	const digest = "3b1f4c5d6e7a8b9c0d1e2f30415263748596a7b8c9dae0f1023456789abcdef0"

	reference, err := ParseTemplateReference(map[string]any{"id": "simple-business-proposal", "version": 1})
	if err != nil {
		t.Fatal(err)
	}
	if reference.SHA256 != "" {
		t.Fatalf("digest = %q, want empty", reference.SHA256)
	}
	if _, present := reference.Document()["sha256"]; present {
		t.Fatal("a reference without a digest stored one")
	}

	reference, err = ParseTemplateReference(map[string]any{"id": "simple-business-proposal", "version": 1, "sha256": digest})
	if err != nil {
		t.Fatal(err)
	}
	if reference.SHA256 != digest {
		t.Fatalf("digest = %q", reference.SHA256)
	}
	if reference.Document()["sha256"] != digest {
		t.Fatalf("stored document = %#v", reference.Document())
	}

	for _, malformed := range []any{"", "abc", strings.ToUpper(digest), 1} {
		if _, err := ParseTemplateReference(map[string]any{"id": "simple-business-proposal", "version": 1, "sha256": malformed}); err == nil {
			t.Fatalf("malformed digest %#v was accepted", malformed)
		}
	}
}
