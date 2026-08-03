package generation

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGenerationRequestReadsTopicAndDisabledResearch(t *testing.T) {
	handler := handler{identity: func(context.Context, *http.Request) (string, error) {
		return "user-1", nil
	}}
	request := httptest.NewRequest(http.MethodPost, "/generate-presentation-stream", strings.NewReader(`{
		"topic":" Grid storage ",
		"slide_count":5,
		"detail_level":"balanced",
		"tonality":"professional",
		"research":{"enabled":false}
	}`))
	response := httptest.NewRecorder()

	userID, input, ok := handler.generationRequest(response, request)
	if !ok {
		t.Fatalf("request rejected with status %d: %s", response.Code, response.Body.String())
	}
	if userID != "user-1" {
		t.Fatalf("user ID = %q", userID)
	}
	if input.Topic != "Grid storage" {
		t.Fatalf("topic = %q", input.Topic)
	}
	if input.Research != nil {
		t.Fatalf("disabled research = %#v", input.Research)
	}
}

func TestGenerationRequestKeepsEnabledResearch(t *testing.T) {
	handler := handler{identity: func(context.Context, *http.Request) (string, error) {
		return "user-1", nil
	}}
	request := httptest.NewRequest(http.MethodPost, "/generate-presentation-stream", strings.NewReader(`{
		"topic":"Grid storage",
		"slide_count":5,
		"research":{"enabled":true}
	}`))
	response := httptest.NewRecorder()

	_, input, ok := handler.generationRequest(response, request)
	if !ok {
		t.Fatalf("request rejected with status %d: %s", response.Code, response.Body.String())
	}
	if input.Research == nil {
		t.Fatal("enabled research was discarded")
	}
}

func TestGenerationPromptDefinesExactBlockFields(t *testing.T) {
	for _, contract := range []string{
		`{"type":"paragraph","region":"main","text":"Concise presentation copy"}`,
		`{"type":"bullets","region":"main","items":["Specific point"],"ordered":false}`,
		"Every slide must contain at least one substantive text block",
	} {
		if !strings.Contains(generationSystemPrompt, contract) {
			t.Fatalf("generation prompt is missing %q", contract)
		}
	}
}

func TestGeneratedContentRejectsSyntheticPlaceholder(t *testing.T) {
	placeholder := []any{map[string]any{
		"type": "content",
		"blocks": []any{map[string]any{
			"type": "paragraph",
			"text": "Content to be developed.",
		}},
	}}
	if hasSubstantiveGeneratedContent(placeholder) {
		t.Fatal("synthetic placeholder was accepted as generated content")
	}

	content := []any{map[string]any{
		"type": "content",
		"blocks": []any{map[string]any{
			"type":  "bullets",
			"items": []any{"A specific point"},
		}},
	}}
	if !hasSubstantiveGeneratedContent(content) {
		t.Fatal("substantive generated content was rejected")
	}
}

func TestPointAccountingMatchesApplicationContract(t *testing.T) {
	if got := estimate(5, "balanced", "professional", 0); got != 5 {
		t.Fatalf("estimate = %v", got)
	}
	if got := estimate(10, "detailed", "persuasive", 0); got != 22 {
		t.Fatalf("estimate = %v", got)
	}
	if got := actualCharge(2500, 5); got != 2.5 {
		t.Fatalf("charge = %v", got)
	}
	if got := actualCharge(9000, 5); got != 5 {
		t.Fatalf("capped charge = %v", got)
	}
	if got := actualCharge(9000, 0); got != 0 {
		t.Fatalf("BYOK charge = %v", got)
	}
}

func TestDecodeGeneratedDocumentRecoversFencedJSON(t *testing.T) {
	document, err := decodeGeneratedDocument("```json\n{\"title\":\"Example\",\"slides\":[]}\n```")
	if err != nil {
		t.Fatal(err)
	}
	if document["title"] != "Example" {
		t.Fatalf("document: %#v", document)
	}
}
