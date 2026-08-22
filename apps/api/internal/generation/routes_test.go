package generation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func TestDoProviderRequestRetriesTransientFailures(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		attempts++
		if attempts < 3 {
			writer.Header().Set("Retry-After", "10")
			writer.WriteHeader(http.StatusTooManyRequests)
			_, _ = writer.Write([]byte(`{"error":{"code":429}}`))
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"choices":[{"message":{"content":"{\"title\":\"Done\",\"slides\":[]}"}}],"usage":{"total_tokens":10}}`))
	}))
	defer server.Close()

	var waits []time.Duration
	handler := &handler{client: server.Client(), sleep: func(_ context.Context, delay time.Duration) error {
		waits = append(waits, delay)
		return nil
	}}
	send := func() (*http.Response, error) {
		return handler.client.Post(server.URL, "application/json", strings.NewReader(`{}`))
	}
	response, err := handler.doProviderRequest(context.Background(), send)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", response.StatusCode)
	}
	if attempts != 3 {
		t.Fatalf("attempts = %d", attempts)
	}
	if len(waits) != 2 || waits[0] != 10*time.Second || waits[1] != 10*time.Second {
		t.Fatalf("waits = %v, want Retry-After honored on every retry", waits)
	}
}

func TestDoProviderRequestGivesUpAfterMaxAttempts(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		attempts++
		writer.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	handler := &handler{client: server.Client(), sleep: func(context.Context, time.Duration) error { return nil }}
	send := func() (*http.Response, error) {
		return handler.client.Post(server.URL, "application/json", strings.NewReader(`{}`))
	}
	response, err := handler.doProviderRequest(context.Background(), send)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if attempts != providerMaxAttempts {
		t.Fatalf("attempts = %d, want %d", attempts, providerMaxAttempts)
	}
	if response.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("final status = %d", response.StatusCode)
	}
}

func TestDoProviderRequestDoesNotRetryClientErrors(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		attempts++
		writer.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	handler := &handler{client: server.Client(), sleep: func(context.Context, time.Duration) error {
		t.Fatal("no request should wait on a non-retryable status")
		return nil
	}}
	send := func() (*http.Response, error) {
		return handler.client.Post(server.URL, "application/json", strings.NewReader(`{}`))
	}
	response, err := handler.doProviderRequest(context.Background(), send)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if attempts != 1 {
		t.Fatalf("attempts = %d, want 1", attempts)
	}
}

func TestParseRetryAfter(t *testing.T) {
	if got := parseRetryAfter(""); got != 0 {
		t.Fatalf("empty header = %v", got)
	}
	if got := parseRetryAfter("7"); got != 7*time.Second {
		t.Fatalf("seconds header = %v", got)
	}
	if got := parseRetryAfter(time.Now().Add(30*time.Second).UTC().Format(http.TimeFormat)); got <= 0 || got > time.Minute {
		t.Fatalf("date header = %v", got)
	}
}

func TestBackoffDelayIsBoundedAndExponential(t *testing.T) {
	for attempt, want := range []time.Duration{2 * time.Second, 4 * time.Second, 8 * time.Second, providerMaximumWait} {
		if got := backoffDelay(attempt); got != want {
			t.Fatalf("backoffDelay(%d) = %v, want %v", attempt, got, want)
		}
	}
}

func TestGoogleGeneratePayloadSeparatesThinkingBudgetOnNewModels(t *testing.T) {
	for _, model := range []string{"gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-pro"} {
		config := googleGeneratePayload(model, "system", "user", 1800)["generationConfig"].(map[string]any)
		if config["thinkingBudget"] != reasoningBudget {
			t.Fatalf("thinking budget missing for %s: %v", model, config["thinkingBudget"])
		}
		if config["maxOutputTokens"] != 1800+reasoningBudget {
			t.Fatalf("answer budget was not preserved for %s: %v", model, config["maxOutputTokens"])
		}
	}
	for _, model := range []string{"gemini-1.5-flash", "gemini-2.0-flash"} {
		config := googleGeneratePayload(model, "system", "user", 1800)["generationConfig"].(map[string]any)
		if _, ok := config["thinkingBudget"]; ok {
			t.Fatalf("thinkingConfig would be rejected by %s", model)
		}
		if config["maxOutputTokens"] != 1800 {
			t.Fatalf("output bound changed for %s: %v", model, config["maxOutputTokens"])
		}
	}
}

func TestOpenAIGeneratePayloadFundsReasoningModels(t *testing.T) {
	for _, model := range []string{"o3", "o4-mini", "gpt-5-mini", "ft:gpt-5:org::suffix"} {
		payload := openAIGeneratePayload(model, "system", "user", 2000)
		if payload["max_completion_tokens"] != 2000+reasoningBudget {
			t.Fatalf("reasoning model %s did not get a padded completion bound: %v", model, payload["max_completion_tokens"])
		}
		if _, ok := payload["max_tokens"]; ok {
			t.Fatalf("reasoning model %s must not use max_tokens", model)
		}
	}
	for _, model := range []string{"gpt-4o", "gpt-4.1-mini"} {
		payload := openAIGeneratePayload(model, "system", "user", 2000)
		if payload["max_tokens"] != 2000 {
			t.Fatalf("classic model %s output bound changed: %v", model, payload["max_tokens"])
		}
		if _, ok := payload["max_completion_tokens"]; ok {
			t.Fatalf("classic model %s received completion bound", model)
		}
	}
}

func TestAnthropicGeneratePayloadEnablesExtendedThinking(t *testing.T) {
	for _, model := range []string{"claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5", "claude-3-7-sonnet-latest"} {
		payload := anthropicGeneratePayload(model, "system", "user", 3000)
		thinking, ok := payload["thinking"].(map[string]any)
		if !ok || thinking["budget_tokens"] != reasoningBudget {
			t.Fatalf("extended thinking missing for %s: %v", model, payload["thinking"])
		}
		if payload["max_tokens"] != 3000+reasoningBudget {
			t.Fatalf("answer budget was not preserved for %s: %v", model, payload["max_tokens"])
		}
	}
	for _, model := range []string{"claude-3-5-sonnet-latest", "claude-3-haiku-20240307"} {
		payload := anthropicGeneratePayload(model, "system", "user", 3000)
		if _, ok := payload["thinking"]; ok {
			t.Fatalf("unsupported thinking block sent to %s", model)
		}
		if payload["max_tokens"] != 3000 {
			t.Fatalf("output bound changed for %s: %v", model, payload["max_tokens"])
		}
	}
}

func TestOpenRouterPayloadReservesReasoningHeadroom(t *testing.T) {
	payload := openRouterGeneratePayload("google/gemma-4-26b-a4b-it:free", "system", "user", 1500)
	if payload["max_tokens"] != 1500+reasoningBudget {
		t.Fatalf("completion bound was not padded: %v", payload["max_tokens"])
	}
	reasoning, ok := payload["reasoning"].(map[string]any)
	if !ok || reasoning["max_tokens"] != reasoningBudget {
		t.Fatalf("reasoning budget missing: %v", payload["reasoning"])
	}
	if payload["stream"] != true || payload["response_format"].(map[string]string)["type"] != "json_object" {
		t.Fatalf("streaming contract changed: %#v", payload)
	}
}

func TestDecodeGeneratedDocumentStripsThinkBlocks(t *testing.T) {
	document, err := decodeGeneratedDocument("<think>The user wants slides about {braces}</think>\n{\"title\":\"Example\",\"slides\":[]}")
	if err != nil {
		t.Fatal(err)
	}
	if document["title"] != "Example" {
		t.Fatalf("document: %#v", document)
	}
	if _, err := decodeGeneratedDocument("<think>unterminated reasoning</think>{\"title\":\"Example\"}"); err != nil {
		t.Fatalf("unterminated think block before JSON: %v", err)
	}
	if _, err := decodeGeneratedDocument("<think>reasoning only, no json"); err == nil {
		t.Fatal("content without JSON was accepted")
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
