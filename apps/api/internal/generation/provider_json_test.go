package generation

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/ai"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
)

func TestGenerateDocumentRepairsParseableEmptyDraft(t *testing.T) {
	responses := []string{
		`{"title":"Infant Mortality in India","slides":[]}`,
		`{"title":"Infant Mortality in India","slides":[{"id":"slide-1","type":"content","layout":"cover","title":"Infant Mortality in India","blocks":[{"type":"paragraph","region":"main","text":"India has reduced infant mortality, but progress remains uneven across states."}]}]}`,
	}
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		content, _ := json.Marshal(responses[requests])
		requests++
		writer.Header().Set("Content-Type", "text/event-stream")
		_, _ = writer.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":" + string(content) + "},\"finish_reason\":\"stop\"}],\"usage\":{\"total_tokens\":10}}\n\n"))
		_, _ = writer.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()

	t.Setenv("OPEN_ROUTER_API_BASE", server.URL)
	t.Setenv("OPEN_ROUTER_MODEL", "test-model")
	t.Setenv("OPEN_ROUTER_API_KEY", "test-key")
	handler := &handler{client: server.Client()}
	job := streamJob{
		slideCount: 1,
		template:   &presentation.TemplateReference{ID: "simple-business-proposal", Version: 1},
	}
	document, tokens, err := handler.generateDocument(context.Background(), job, nil)
	if err != nil {
		t.Fatal(err)
	}
	if requests != 2 {
		t.Fatalf("provider requests = %d, want one draft and one repair", requests)
	}
	if tokens != 20 {
		t.Fatalf("tokens = %d, want aggregate usage from both calls", tokens)
	}
	if issue := draftValidationIssue(document, job, nil); issue != "" {
		t.Fatalf("repaired document remained invalid: %s", issue)
	}
}

func TestModelUsesOpenRouterFreeByDefault(t *testing.T) {
	t.Setenv("OPEN_ROUTER_MODEL", "")
	if got := model(); got != "openrouter/free" {
		t.Fatalf("default model = %q", got)
	}
}

func TestDecodeGeneratedDocumentRepairsTruncatedJSON(t *testing.T) {
	cases := []struct {
		name      string
		content   string
		wantSlide string
	}{
		{
			name:      "cut off inside a string value",
			content:   `{"title":"Deck","slides":[{"id":"s1","title":"The Gap Is Clos`,
			wantSlide: "s1",
		},
		{
			name:      "cut off between slide objects",
			content:   `{"title":"Deck","slides":[{"id":"s1"},{"id":"s2"},{"id":"s3"`,
			wantSlide: "s3",
		},
		{
			name:      "cut off inside an escaped string",
			content:   `{"title":"Deck","slides":[{"id":"s1","message":"costs \\`,
			wantSlide: "s1",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			document, err := decodeGeneratedDocument(tc.content)
			if err != nil {
				t.Fatalf("truncated JSON should be repaired: %v", err)
			}
			slides, ok := document["slides"].([]any)
			if !ok || len(slides) == 0 {
				t.Fatalf("repaired document lost its slides: %v", document)
			}
			last, _ := slides[len(slides)-1].(map[string]any)
			if last["id"] != tc.wantSlide {
				t.Fatalf("last slide id = %v, want %v", last["id"], tc.wantSlide)
			}
		})
	}
}

func TestDecodeGeneratedDocumentStillRejectsGarbage(t *testing.T) {
	cases := []struct {
		name    string
		content string
	}{
		{"no braces at all", "Sorry, I cannot help with that."},
		{"object without slides", `{"title":"Only a title"`},
		{"truncated mid keyword", `{"title":"Deck","slides":[tru`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := decodeGeneratedDocument(tc.content); err == nil {
				t.Fatalf("content %q should not decode", tc.name)
			} else if !strings.Contains(err.Error(), "invalid presentation JSON") {
				t.Fatalf("error %v does not carry the user-facing message", err)
			}
		})
	}
}

func TestDecodeGeneratedDocumentToleratesSurroundingProse(t *testing.T) {
	document, err := decodeGeneratedDocument("<think>reasoning {with} braces</think>\n```json\n{\"title\":\"A\"}\n```\nand also {\"title\":\"B\"}")
	if err != nil {
		t.Fatalf("prose-wrapped JSON should decode: %v", err)
	}
	if document["title"] != "A" {
		t.Fatalf("title = %v, want the first object to win", document["title"])
	}
}

// A length-capped stream whose output cannot be salvaged must fail with a
// truncation explanation instead of the generic invalid-JSON message.
func TestGenerateJSONReportsLengthCappedStream(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/event-stream")
		_, _ = writer.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"{\\\"title\\\":\\\"Deck\\\",\\\"slides\\\":[tru\"},\"finish_reason\":\"length\"}]}\n\n"))
	}))
	defer server.Close()

	t.Setenv("OPEN_ROUTER_API_BASE", server.URL)
	t.Setenv("OPEN_ROUTER_MODEL", "test-model")
	t.Setenv("OPEN_ROUTER_API_KEY", "test-key")

	handler := &handler{client: server.Client()}
	_, _, err := handler.generateJSON(context.Background(), streamJob{slideCount: 5}, "system", "user", 1000)
	if err == nil {
		t.Fatal("a length-capped truncated response must not decode as success")
	}
	if !strings.Contains(err.Error(), "output token limit") {
		t.Fatalf("error %v should explain the output token limit", err)
	}
	if !strings.Contains(err.Error(), "bytes received") {
		t.Fatalf("error %v should report how much arrived", err)
	}
}

func TestDirectProviderReportsLengthCap(t *testing.T) {
	const body = `{"choices":[{"message":{"content":"{\"title\":\"Deck\",\"slides\":[tru"},"finish_reason":"length"}],"usage":{"total_tokens":10}}`
	// directProvider hardcodes real provider endpoints, so stub the transport.
	client := &http.Client{Transport: roundTripperFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})}

	handler := &handler{client: client}
	_, _, err := handler.directProvider(context.Background(), ai.OpenAI, "gpt-4.1", "key", "system", "user", 1000)
	if err == nil {
		t.Fatal("a length-capped response must not decode as success")
	}
	if !strings.Contains(err.Error(), "output token limit") {
		t.Fatalf("error %v should explain the output token limit", err)
	}
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (function roundTripperFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}
