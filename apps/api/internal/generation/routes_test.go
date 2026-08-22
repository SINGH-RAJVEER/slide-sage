package generation

import (
	"context"
	"encoding/json"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func decodeSubmitBody(t *testing.T, raw string) map[string]any {
	t.Helper()
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	var body map[string]any
	if err := decoder.Decode(&body); err != nil {
		t.Fatal(err)
	}
	return body
}

func TestSubmitInputReadsTopicAndDisabledResearch(t *testing.T) {
	body := decodeSubmitBody(t, `{
		"topic":" Grid storage ",
		"slide_count":5,
		"detail_level":"balanced",
		"tonality":"professional",
		"research":{"enabled":false}
	}`)
	input, err := parseSubmitInput(body)
	if err != nil {
		t.Fatal(err)
	}
	if input.Topic != "Grid storage" {
		t.Fatalf("topic = %q", input.Topic)
	}
	if input.Research != nil {
		t.Fatalf("disabled research = %#v", input.Research)
	}
	if input.ParentID != "" || input.RetryID != "" {
		t.Fatalf("unexpected presentation targeting: %q %q", input.ParentID, input.RetryID)
	}
}

func TestSubmitInputKeepsEnabledResearch(t *testing.T) {
	body := decodeSubmitBody(t, `{
		"topic":"Grid storage",
		"slide_count":5,
		"research":{"enabled":true}
	}`)
	input, err := parseSubmitInput(body)
	if err != nil {
		t.Fatal(err)
	}
	if input.Research == nil {
		t.Fatal("enabled research was discarded")
	}
}

func TestSubmitInputRejectsParentAndRetryTogether(t *testing.T) {
	body := decodeSubmitBody(t, `{
		"topic":"Grid storage",
		"slide_count":5,
		"parent_presentation_id":"pres-1",
		"retry_presentation_id":"pres-2"
	}`)
	if _, err := parseSubmitInput(body); err == nil {
		t.Fatal("parent and retry targeting were both accepted")
	}
}

func TestGenerationPromptDefinesExactBlockFields(t *testing.T) {
	for _, contract := range []string{
		`{"type":"paragraph","region":"main","text":"Concise presentation copy"}`,
		`{"type":"bullets","region":"main","items":["Specific point"],"ordered":false}`,
		`"focalPoint":"center"`,
		"Every slide must contain at least one substantive text block",
	} {
		if !strings.Contains(generationSystemPrompt, contract) {
			t.Fatalf("generation prompt is missing %q", contract)
		}
	}
}

func TestPlanningPromptDefinesBoundedVisualIntents(t *testing.T) {
	for _, contract := range []string{"DeckPlan", `"kind":"timeline"`, `"kind":"comparison"`, `"kind":"chart"`} {
		if !strings.Contains(planningSystemPrompt, contract) {
			t.Fatalf("planning prompt is missing %q", contract)
		}
	}
	if maxPlanOutputTokens(40) > 4000 || maxPlanOutputTokens(1) < 600 {
		t.Fatalf("unexpected planning output bound")
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

func TestPointAccountingUsesMilliPoints(t *testing.T) {
	quote := authorizationMillis(5, "A concise topic", nil, nil, nil, 0)
	if quote <= 0 {
		t.Fatalf("authorization = %v", quote)
	}
	if got := actualCharge(2500, quote); got != 2500 {
		t.Fatalf("charge = %v", got)
	}
	if got := actualCharge(int(quote+1), quote); got != quote {
		t.Fatalf("bounded charge = %v", got)
	}
	if got := actualCharge(9000, 0); got != 0 {
		t.Fatalf("BYOK charge = %v", got)
	}
}

func TestIdempotencyKeyValidation(t *testing.T) {
	if key, err := validateIdempotencyKey("operation-123456789"); err != nil || key != "operation-123456789" {
		t.Fatalf("idempotency key = %q, %v", key, err)
	}
	if _, err := validateIdempotencyKey("invalid key"); err == nil {
		t.Fatal("invalid idempotency key was accepted")
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

func TestStreamLimiterEnforcesGlobalAndPerUserLimits(t *testing.T) {
	limiter := newStreamLimiter(2, 1)
	if !limiter.acquire("user-1") {
		t.Fatal("first stream was rejected")
	}
	if limiter.acquire("user-1") {
		t.Fatal("per-user stream limit was not enforced")
	}
	if !limiter.acquire("user-2") {
		t.Fatal("second user's stream was rejected")
	}
	if limiter.acquire("user-3") {
		t.Fatal("global stream limit was not enforced")
	}
	limiter.release("user-1")
	if !limiter.acquire("user-3") {
		t.Fatal("released stream capacity was not reused")
	}
}

func TestRunBoundedLimitsConcurrentWork(t *testing.T) {
	items := []int{1, 2, 3, 4, 5}
	release := make(chan struct{})
	started := make(chan struct{}, len(items))
	var active atomic.Int32
	var maximum atomic.Int32
	done := make(chan error, 1)
	go func() {
		done <- runBounded(context.Background(), 2, items, func(context.Context, int) error {
			current := active.Add(1)
			for {
				observed := maximum.Load()
				if current <= observed || maximum.CompareAndSwap(observed, current) {
					break
				}
			}
			started <- struct{}{}
			<-release
			active.Add(-1)
			return nil
		})
	}()

	for range 2 {
		select {
		case <-started:
		case <-time.After(time.Second):
			t.Fatal("bounded work did not start")
		}
	}
	select {
	case <-started:
		t.Fatal("more than two tasks started before capacity was released")
	case <-time.After(25 * time.Millisecond):
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if maximum.Load() != 2 {
		t.Fatalf("maximum concurrency = %d", maximum.Load())
	}
}
