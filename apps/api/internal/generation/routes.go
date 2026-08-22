// Package generation implements direct, persisted presentation generation routes.
package generation

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/ai"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
)

const (
	maxBodyBytes         = 256 * 1024
	defaultModel         = "google/gemma-4-26b-a4b-it"
	providerMaxAttempts  = 4
	providerInitialWait  = 2 * time.Second
	providerMaximumWait  = 15 * time.Second
	planningSystemPrompt = `Return exactly one JSON object and no Markdown. Create a DeckPlan with title, audience, thesis, style, and slides. style must be minimal, visual, classic, or consultant. Return exactly the requested number of slides. Each slide requires id, purpose, title, message, evidence, and visualIntent. purpose must be cover, section, context, problem, insight, solution, evidence, comparison, process, recommendation, or closing. visualIntent must be one of these data-only shapes:
- {"kind":"none"}
- {"kind":"image-hero","imagePrompt":"Specific visual direction","focalPoint":"center"}
- {"kind":"timeline","events":[{"label":"2024","title":"Milestone","description":"What changed"},{"label":"2025","title":"Next milestone","description":"What changes next"}]}
- {"kind":"process","nodes":[{"label":"Step","description":"What happens"},{"label":"Next step","description":"What happens next"}]}
- {"kind":"comparison","left":{"title":"Option A","items":["Point"]},"right":{"title":"Option B","items":["Point"]}}
- {"kind":"metric-grid","metrics":[{"value":"42%","label":"Metric"},{"value":"3x","label":"Metric"}]}
- {"kind":"chart","chartType":"bar","dataSeries":[{"label":"Series","values":[1,2]}]}
Use visual intents only when they clarify the slide message. Evidence must contain short source references from the supplied research, never invented citations. Never return HTML, Markdown, CSS, code, coordinates, colors, URLs, styles, or class names.`
	generationSystemPrompt = `Return exactly one JSON object and no Markdown.
The object must contain title, theme, and slides. Every slide must use type "content" and contain id, layout, title, subtitle, tone, density, pattern, and a top-level blocks array. Every slide must contain at least one substantive text block.
Use only these exact block shapes:
- {"type":"paragraph","region":"main","text":"Concise presentation copy"}
- {"type":"bullets","region":"main","items":["Specific point"],"ordered":false}
- {"type":"quote","region":"main","text":"Quote","attribution":"Source"}
- {"type":"callout","region":"main","heading":"Key point","text":"Supporting detail"}
- {"type":"image-placeholder","region":"media","alt":"Description of a useful visual","caption":"Optional caption","focalPoint":"center"}
Block region must be main, primary, secondary, or media. Do not rename text or items, do not nest blocks under content, and do not return empty blocks. Never return HTML, Markdown, CSS, code, styles, class names, coordinates, or arbitrary colors.`
)

type Identity func(context.Context, *http.Request) (string, error)

// RouteConfig controls long-lived generation event streams and synchronous
// research previews.
type RouteConfig struct {
	StreamContext     context.Context
	MaxStreams        int
	MaxStreamsPerUser int
	Research          *presentation.ExaResearchService
}

// RegisterRoutes installs durable generation submission and event endpoints.
func RegisterRoutes(mux *http.ServeMux, database *sql.DB, identity Identity, connections ai.ConnectionService, config RouteConfig) {
	if mux == nil || database == nil || identity == nil {
		panic("generation routes require mux, database, and identity callback")
	}
	if config.StreamContext == nil {
		config.StreamContext = context.Background()
	}
	if config.MaxStreams < 1 {
		config.MaxStreams = positiveEnvInt("GENERATION_STREAM_LIMIT", 40)
	}
	if config.MaxStreamsPerUser < 1 {
		config.MaxStreamsPerUser = positiveEnvInt("GENERATION_STREAM_LIMIT_PER_USER", 3)
	}
	queue, err := newInsertClient(database)
	if err != nil {
		panic(fmt.Sprintf("create generation queue client: %v", err))
	}
	handler := &handler{
		database:      database,
		identity:      identity,
		connections:   connections,
		client:        &http.Client{Timeout: 3 * time.Minute},
		queue:         queue,
		streamContext: config.StreamContext,
		streams:       newStreamLimiter(config.MaxStreams, config.MaxStreamsPerUser),
		research:      config.Research,
	}
	mux.HandleFunc("POST /presentation-jobs", handler.submit)
	mux.HandleFunc("GET /generation-jobs/{id}", handler.jobStatus)
	mux.HandleFunc("GET /generation-jobs/{id}/events", handler.jobEvents)
	mux.HandleFunc("POST /generation-jobs/{id}/cancel", handler.cancelJob)
}

// RecoverExpired finalizes abandoned authorizations even when their user does
// not submit another request. It is safe to call concurrently from API nodes.
func RecoverExpired(ctx context.Context, database *sql.DB) error {
	rows, err := database.QueryContext(ctx, `SELECT operation.user_id FROM generation_point_operations operation WHERE operation.status = 'reserved' AND operation.expires_at <= NOW() AND NOT EXISTS (SELECT 1 FROM generation_jobs job WHERE job.operation_id = operation.id AND job.status IN ('queued', 'running', 'retrying')) GROUP BY operation.user_id ORDER BY MIN(operation.expires_at) LIMIT 100`)
	if err != nil {
		return err
	}
	userIDs := []string{}
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			_ = rows.Close()
			return err
		}
		userIDs = append(userIDs, userID)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	recoveryHandler := &handler{database: database}
	return runBounded(ctx, 2, userIDs, func(ctx context.Context, userID string) error {
		return recoveryHandler.recoverExpired(ctx, userID)
	})
}

type handler struct {
	database      *sql.DB
	identity      Identity
	client        *http.Client
	connections   ai.ConnectionService
	queue         *queueClient
	streamContext context.Context
	streams       *streamLimiter
	research      *presentation.ExaResearchService
	sleep         func(context.Context, time.Duration) error
}

// doProviderRequest sends a provider request and retries transient failures
// (429 and 5xx) with exponential backoff, honoring Retry-After when present.
func (h *handler) doProviderRequest(ctx context.Context, send func() (*http.Response, error)) (*http.Response, error) {
	for attempt := 0; ; attempt++ {
		response, err := send()
		if err != nil {
			return nil, err
		}
		if !retryableStatus(response.StatusCode) || attempt == providerMaxAttempts-1 {
			return response, nil
		}
		delay := backoffDelay(attempt)
		if after := parseRetryAfter(response.Header.Get("Retry-After")); after > delay {
			delay = min(after, providerMaximumWait)
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 16*1024))
		response.Body.Close()
		if err := h.wait(ctx, delay); err != nil {
			return nil, err
		}
	}
}

func (h *handler) wait(ctx context.Context, delay time.Duration) error {
	if h.sleep != nil {
		return h.sleep(ctx, delay)
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func retryableStatus(status int) bool {
	return status == http.StatusTooManyRequests || status >= 500
}

func backoffDelay(attempt int) time.Duration {
	delay := providerInitialWait << attempt
	return min(delay, providerMaximumWait)
}

func parseRetryAfter(value string) time.Duration {
	value = strings.TrimSpace(value)
	if seconds, err := strconv.Atoi(value); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}
	if when, err := http.ParseTime(value); err == nil {
		if remaining := time.Until(when); remaining > 0 {
			return remaining
		}
	}
	return 0
}

type streamLimiter struct {
	mu         sync.Mutex
	total      int
	maxTotal   int
	maxPerUser int
	byUser     map[string]int
}

func newStreamLimiter(maxTotal, maxPerUser int) *streamLimiter {
	return &streamLimiter{maxTotal: maxTotal, maxPerUser: maxPerUser, byUser: map[string]int{}}
}

func (limiter *streamLimiter) acquire(userID string) bool {
	if limiter == nil {
		return true
	}
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	if limiter.total >= limiter.maxTotal || limiter.byUser[userID] >= limiter.maxPerUser {
		return false
	}
	limiter.total++
	limiter.byUser[userID]++
	return true
}

func (limiter *streamLimiter) release(userID string) {
	if limiter == nil {
		return
	}
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	if limiter.byUser[userID] == 0 {
		return
	}
	limiter.total--
	limiter.byUser[userID]--
	if limiter.byUser[userID] == 0 {
		delete(limiter.byUser, userID)
	}
}

func positiveEnvInt(name string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(name)))
	if err != nil || value < 1 {
		return fallback
	}
	return value
}

type submitInput struct {
	Topic           string
	ParentID        string
	RetryID         string
	SlideCount      int
	DetailLevel     string
	Tonality        string
	Theme           string
	Research        any
	ResearchPayload *presentation.ResearchPayload
	AI              *ai.Selection
}

type persistedPresentation struct {
	ID       string
	Title    string
	Prompt   string
	Data     json.RawMessage
	Revision int
}

// submit creates a durable presentation job and returns its identity as JSON.
// The client supplies the job ID, which doubles as the idempotency key:
// resubmitting the same job ID with the same body attaches to the existing
// job, and with a different body conflicts. Progress is consumed separately
// through GET /generation-jobs/{id}/events.
func (h *handler) submit(writer http.ResponseWriter, request *http.Request) {
	userID, body, ok := h.body(writer, request, maxBodyBytes)
	if !ok {
		return
	}
	input, err := parseSubmitInput(body)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	jobID := text(first(body, "job_id", "jobId"), "")
	if jobID == "" {
		jobID, err = uuid()
		if err != nil {
			writeError(writer, http.StatusInternalServerError, "Unable to start generation")
			return
		}
	} else if _, idempotencyErr := validateIdempotencyKey(jobID); idempotencyErr != nil {
		writeError(writer, http.StatusBadRequest, "job_id "+idempotencyErr.Error())
		return
	}
	requestHashValue := requestHash(input)

	// Preview mode runs research synchronously and stops before any planning
	// or drafting work, so clients can show sources before committing points.
	if preview, _ := body["preview"].(bool); preview {
		if input.ParentID != "" || input.RetryID != "" {
			writeError(writer, http.StatusBadRequest, "preview cannot target an existing presentation")
			return
		}
		options, ok := input.Research.(presentation.ResearchOptions)
		if !ok || !options.Enabled {
			writeError(writer, http.StatusBadRequest, "preview requires enabled research")
			return
		}
		if h.research == nil {
			writeError(writer, http.StatusServiceUnavailable, "Research is unavailable")
			return
		}
		result, err := presentation.RunResearchPreview(request.Context(), h.database, h.research, userID, jobID, requestHashValue, input.Topic, options, input.SlideCount, input.DetailLevel, input.Tonality)
		if err != nil {
			var previewErr *presentation.ResearchPreviewError
			if errors.As(err, &previewErr) {
				if previewErr.Insufficient {
					writeJSON(writer, previewErr.Status, map[string]any{"error": map[string]string{"message": previewErr.Message, "code": "INSUFFICIENT_TOKENS"}, "slide_tokens_remaining": previewErr.RemainingPoints, "slide_tokens_required": previewErr.RequiredPoints})
					return
				}
				writeError(writer, previewErr.Status, previewErr.Message)
				return
			}
			writeError(writer, http.StatusInternalServerError, "Unable to start generation")
			return
		}
		writeJSON(writer, http.StatusOK, map[string]any{"sources": result.Sources, "estimated_tokens": result.EstimatedTokens, "slide_tokens_remaining": result.RemainingPoints})
		return
	}

	var job streamJob
	var placeholder []byte
	create := false
	if input.ParentID != "" {
		job, err = h.iterationJob(request.Context(), userID, input)
	} else {
		job, placeholder, err = h.generationJob(request.Context(), userID, input, jobID, requestHashValue)
		create = input.RetryID == ""
	}
	if err != nil {
		var duplicate duplicateSubmit
		if errors.As(err, &duplicate) {
			writeJSON(writer, http.StatusOK, map[string]any{"job_id": duplicate.jobID, "presentation_id": duplicate.presentationID, "status": "existing"})
			return
		}
		var status writeStatusError
		if errors.As(err, &status) {
			writeError(writer, status.Status, status.Message)
			return
		}
		h.reservationError(writer, err)
		return
	}

	balance, _, err := h.enqueue(request.Context(), job, requestHashValue, create, input.Topic, placeholder)
	if err != nil {
		var duplicate duplicateOperation
		if errors.As(err, &duplicate) && duplicate.jobID != "" {
			writeJSON(writer, http.StatusOK, map[string]any{"job_id": duplicate.jobID, "presentation_id": duplicate.presentationID, "status": "existing"})
			return
		}
		h.reservationError(writer, err)
		return
	}
	_ = balance
	writeJSON(writer, http.StatusAccepted, map[string]any{"job_id": job.jobID, "presentation_id": job.presentationID, "status": "queued"})
}

// duplicateSubmit reports that a submission already exists for the supplied
// job ID, carrying its committed identity.
type duplicateSubmit struct {
	jobID, presentationID string
}

func (duplicateSubmit) Error() string { return "duplicate submission" }

type writeStatusError struct {
	Status  int
	Message string
}

func (e writeStatusError) Error() string { return e.Message }

// parseSubmitInput validates the unified submission body. A parent_presentation_id
// marks an iteration of an existing deck; retry_presentation_id resubmits a
// failed generation; neither means a fresh generation.
func parseSubmitInput(body map[string]any) (submitInput, error) {
	topic, err := required(first(body, "topic", "feedback", "prompt"), "topic")
	if err != nil {
		return submitInput{}, err
	}
	input := submitInput{Topic: topic}
	input.ParentID = text(first(body, "parent_presentation_id", "parentPresentationId"), "")
	input.RetryID = text(first(body, "retry_presentation_id", "retryPresentationId"), "")
	if len(input.ParentID) > 200 || len(input.RetryID) > 200 {
		return submitInput{}, errors.New("presentation id must contain at most 200 characters")
	}
	if input.ParentID != "" && input.RetryID != "" {
		return submitInput{}, errors.New("parent_presentation_id and retry_presentation_id are mutually exclusive")
	}
	slides, err := slideCount(body, input.ParentID == "")
	if err != nil {
		return submitInput{}, err
	}
	input.SlideCount = slides
	research, err := parseResearch(body["research"])
	if err != nil {
		return submitInput{}, err
	}
	input.Research = research
	input.DetailLevel = choice(body["detail_level"], body["detailLevel"], "balanced", "brief", "concise", "balanced", "detailed", "comprehensive")
	input.Tonality = choice(body["tonality"], nil, "professional", "casual", "professional", "enthusiastic", "persuasive")
	input.Theme = text(body["theme"], "corporate-blue")
	if !validDetail(input.DetailLevel) || !validTonality(input.Tonality) || len(input.Theme) > 100 {
		return submitInput{}, errors.New("Invalid generation options")
	}
	if value := first(body, "research_payload", "researchPayload"); value != nil {
		payload, err := presentation.ParseResearchPayload(value)
		if err != nil {
			return submitInput{}, err
		}
		input.ResearchPayload = &payload
	}
	selection, err := parseAISelection(body["ai"])
	if err != nil {
		return submitInput{}, err
	}
	input.AI = selection
	return input, nil
}

func (h *handler) generationJob(ctx context.Context, userID string, input submitInput, jobID, hash string) (streamJob, []byte, error) {
	presentationID := input.RetryID
	if presentationID != "" {
		existing, err := h.ownedPresentation(ctx, presentationID, userID)
		if err != nil {
			return streamJob{}, nil, writeStatusError{http.StatusNotFound, "Presentation not found"}
		}
		var document map[string]any
		_ = json.Unmarshal(existing.Data, &document)
		if document["status"] != "failed" {
			duplicate, err := h.existingSubmission(ctx, userID, jobID, hash)
			if err == nil && duplicate.jobID != "" {
				return streamJob{}, nil, duplicateSubmit{jobID: duplicate.jobID, presentationID: duplicate.presentationID}
			}
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return streamJob{}, nil, err
			}
			return streamJob{}, nil, writeStatusError{http.StatusConflict, "Only failed presentations can be retried"}
		}
	}
	quote := authorizationMillis(input.SlideCount, input.Topic, nil, input.Research, input.ResearchPayload, maxPlanOutputTokens(input.SlideCount))
	operationID, err := uuid()
	if err != nil {
		return streamJob{}, nil, err
	}
	if presentationID == "" {
		presentationID, err = uuid()
		if err != nil {
			return streamJob{}, nil, err
		}
	}
	selection, _, err := h.connections.CredentialForGeneration(ctx, userID, input.AI)
	if err != nil {
		return streamJob{}, nil, writeStatusError{http.StatusConflict, err.Error()}
	}
	if selection != nil {
		quote = 0
	}
	initial := map[string]any{"schemaVersion": presentation.PresentationSchemaVersion, "title": "Generating...", "theme": input.Theme, "dimensions": map[string]int{"width": 1280, "height": 720}, "slides": []any{}, "status": "generating", "failure": map[string]any{"retry": map[string]any{"prompt": input.Topic, "slide_count": input.SlideCount, "detail_level": input.DetailLevel, "tonality": input.Tonality, "theme": input.Theme, "research_enabled": input.Research != nil || input.ResearchPayload != nil, "research_payload": input.ResearchPayload, "ai": input.AI}}}
	placeholder, _ := json.Marshal(initial)
	job := streamJob{jobID: jobID, userID: userID, operationID: operationID, presentationID: presentationID, quote: quote, prompt: input.Topic, slideCount: input.SlideCount, detailLevel: input.DetailLevel, tonality: input.Tonality, theme: input.Theme, research: input.Research, researchPayload: input.ResearchPayload, selection: selection, kind: "generation"}
	return job, placeholder, nil
}

func (h *handler) iterationJob(ctx context.Context, userID string, input submitInput) (streamJob, error) {
	base, err := h.ownedPresentation(ctx, input.ParentID, userID)
	if err != nil {
		return streamJob{}, writeStatusError{http.StatusNotFound, "Presentation not found"}
	}
	count := input.SlideCount
	if count == 0 {
		var document struct {
			Slides []any `json:"slides"`
		}
		_ = json.Unmarshal(base.Data, &document)
		count = len(document.Slides)
		if count == 0 {
			count = 5
		}
	}
	operationID, err := uuid()
	if err != nil {
		return streamJob{}, err
	}
	quote := authorizationMillis(count, input.Topic, base.Data, input.Research, nil, 0)
	selection, _, err := h.connections.CredentialForGeneration(ctx, userID, input.AI)
	if err != nil {
		return streamJob{}, writeStatusError{http.StatusConflict, err.Error()}
	}
	if selection != nil {
		quote = 0
	}
	job := streamJob{userID: userID, operationID: operationID, presentationID: base.ID, expectedRevision: base.Revision, quote: quote, prompt: input.Topic, slideCount: count, detailLevel: input.DetailLevel, tonality: input.Tonality, theme: documentTheme(base.Data), research: input.Research, selection: selection, current: base.Data, kind: "iteration"}
	return job, nil
}

type streamJob struct {
	jobID, userID, operationID, presentationID string
	expectedRevision                           int
	quote                                      int64
	prompt                                     string
	slideCount                                 int
	detailLevel, tonality, theme, kind         string
	research                                   any
	researchPayload                            *presentation.ResearchPayload
	selection                                  *ai.Selection
	credential                                 string
	current                                    json.RawMessage
	requestHash                                string
}

func generationUserPrompt(job streamJob) string {
	user := fmt.Sprintf("Create a %d-slide %s, %s presentation about: %s", job.slideCount, job.detailLevel, job.tonality, job.prompt)
	if job.kind == "iteration" {
		user = fmt.Sprintf("Revise this presentation according to: %s\n\nCurrent presentation: %s", job.prompt, string(job.current))
	}
	if job.research != nil {
		encoded, _ := json.Marshal(job.research)
		user += "\n\nResearch constraints: " + string(encoded)
	}
	if job.researchPayload != nil {
		encoded, _ := json.Marshal(job.researchPayload.Sources)
		user += "\n\nUse these reviewed sources and preserve factual attribution: " + string(encoded)
	}
	return user
}

func (h *handler) generatePlan(ctx context.Context, job streamJob) (map[string]any, int, error) {
	plan, tokens, err := h.generateJSON(ctx, job, planningSystemPrompt, generationUserPrompt(job), maxPlanOutputTokens(job.slideCount))
	if err != nil {
		return nil, 0, err
	}
	normalized, err := presentation.NormalizeDeckPlan(plan, job.slideCount)
	if err != nil {
		return nil, 0, err
	}
	return normalized, tokens, nil
}

func (h *handler) generateDocument(ctx context.Context, job streamJob, plan map[string]any) (map[string]any, int, error) {
	user := generationUserPrompt(job)
	if plan != nil {
		encoded, _ := json.Marshal(plan)
		user += "\n\nDraft this validated DeckPlan in order. Preserve every planned slide's id, title, message, evidence, and semantic layout intent. Write substantive slide copy for each plan entry: " + string(encoded)
	}
	return h.generateJSON(ctx, job, generationSystemPrompt, user, maxOutputTokens(job.slideCount))
}

func (h *handler) generateJSON(ctx context.Context, job streamJob, system, user string, maxOutput int) (map[string]any, int, error) {
	key := strings.TrimSpace(os.Getenv("OPEN_ROUTER_API_KEY"))
	if key == "" {
		key = strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY"))
	}
	provider := ai.Provider("openrouter")
	model := strings.TrimSpace(os.Getenv("OPEN_ROUTER_MODEL"))
	if model == "" {
		model = defaultModel
	}
	if job.selection != nil {
		provider, model, key = job.selection.Provider, job.selection.Model, job.credential
	}
	if key == "" {
		return nil, 0, errors.New("AI provider is not configured")
	}
	if provider != "openrouter" {
		return h.directProvider(ctx, provider, model, key, system, user, maxOutput)
	}
	// openRouterGeneratePayload always includes the reasoning parameter because
	// OpenRouter normalizes it across providers and drops it for models that
	// cannot reason. Reasoning tokens count toward the completion bound on
	// reasoning models, and the same amount is added on top of the requested
	// output bound to keep the full answer budget available.
	payload := openRouterGeneratePayload(model, system, user, maxOutput)
	encoded, _ := json.Marshal(payload)
	endpoint := strings.TrimSpace(os.Getenv("OPEN_ROUTER_API_BASE"))
	if endpoint == "" {
		endpoint = "https://openrouter.ai/api/v1/chat/completions"
	}
	send := func() (*http.Response, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(encoded)))
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+key)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("HTTP-Referer", strings.TrimSpace(os.Getenv("BASE_URL")))
		req.Header.Set("X-OpenRouter-Title", "Slide Sage")
		return h.client.Do(req)
	}
	response, err := h.doProviderRequest(ctx, send)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 16*1024))
		return nil, 0, &providerRequestError{Status: response.StatusCode, Message: fmt.Sprintf("OpenRouter request failed: %s", summarizeProviderError(body))}
	}
	var content strings.Builder
	tokens := 0
	scanner := bufio.NewScanner(response.Body)
	scanner.Buffer(make([]byte, 16*1024), 2*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
			Usage struct {
				TotalTokens int `json:"total_tokens"`
			} `json:"usage"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal([]byte(data), &chunk) != nil {
			continue
		}
		if chunk.Error != nil {
			return nil, 0, errors.New(chunk.Error.Message)
		}
		if len(chunk.Choices) > 0 {
			if content.Len()+len(chunk.Choices[0].Delta.Content) > 8*1024*1024 {
				return nil, 0, errors.New("OpenRouter response is too large")
			}
			content.WriteString(chunk.Choices[0].Delta.Content)
		}
		if chunk.Usage.TotalTokens > 0 {
			tokens = chunk.Usage.TotalTokens
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, 0, err
	}
	document, err := decodeGeneratedDocument(content.String())
	if err != nil {
		return nil, 0, err
	}
	return document, tokens, nil
}

// reasoningBudget is the per-call reasoning allowance reserved on top of the
// requested answer bound for every provider whose thinking tokens compete with
// output tokens. It fits every reasoning-capable family (the smallest
// supported nonzero budgets are 128 for Gemini Pro, 512 for Gemini Flash Lite,
// and 1024 for Anthropic extended thinking).
const reasoningBudget = 4096

func googleGeneratePayload(model, system, user string, maxOutput int) map[string]any {
	config := map[string]any{"responseMimeType": "application/json", "maxOutputTokens": maxOutput}
	if googleSupportsThinkingControl(model) {
		// Google nests thinking control under generationConfig.thinkingConfig;
		// a bare thinkingBudget field is rejected with 400 INVALID_ARGUMENT.
		config["thinkingConfig"] = map[string]any{"thinkingBudget": reasoningBudget}
		config["maxOutputTokens"] = maxOutput + reasoningBudget
	}
	return map[string]any{
		"systemInstruction": map[string]any{"parts": []map[string]string{{"text": system}}},
		"contents":          []map[string]any{{"role": "user", "parts": []map[string]string{{"text": user}}}},
		"generationConfig":  config,
	}
}

func openRouterGeneratePayload(model, system, user string, maxOutput int) map[string]any {
	return map[string]any{"model": model, "max_tokens": maxOutput + reasoningBudget, "reasoning": map[string]any{"max_tokens": reasoningBudget}, "stream": true, "stream_options": map[string]bool{"include_usage": true}, "response_format": map[string]string{"type": "json_object"}, "messages": []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": user}}}
}

func googleSupportsThinkingControl(model string) bool {
	name := strings.ToLower(model)
	return strings.HasPrefix(name, "gemini-2.5") || strings.HasPrefix(name, "gemini-3") || strings.HasPrefix(name, "gemini-4")
}

// openAIGeneratePayload switches reasoning models to max_completion_tokens,
// which they require and which counts reasoning toward the completion bound.
// Classic GPT models keep the legacy max_tokens parameter untouched.
func openAIGeneratePayload(model string, system, user string, maxOutput int) map[string]any {
	messages := []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": user}}
	if openAIReasoningModel(model) {
		return map[string]any{"model": model, "max_completion_tokens": maxOutput + reasoningBudget, "response_format": map[string]string{"type": "json_object"}, "messages": messages}
	}
	return map[string]any{"model": model, "max_tokens": maxOutput, "response_format": map[string]string{"type": "json_object"}, "messages": messages}
}

func openAIReasoningModel(model string) bool {
	base := strings.ToLower(strings.TrimPrefix(model, "ft:"))
	if i := strings.IndexByte(base, ':'); i >= 0 {
		base = base[:i]
	}
	oSeries := len(base) > 1 && base[0] == 'o' && base[1] >= '1' && base[1] <= '9'
	return oSeries || strings.HasPrefix(base, "gpt-5")
}

// anthropicGeneratePayload enables extended thinking for Claude generations
// that support it. Thinking tokens count against max_tokens, so the same
// amount is added on top of the requested output bound. Anthropic requires
// budget_tokens of at least 1024 and a max_tokens strictly greater than it.
func anthropicGeneratePayload(model, system, user string, maxOutput int) map[string]any {
	payload := map[string]any{"model": model, "max_tokens": maxOutput, "system": system, "messages": []map[string]string{{"role": "user", "content": user}}}
	if anthropicSupportsThinking(model) {
		payload["thinking"] = map[string]any{"type": "enabled", "budget_tokens": reasoningBudget}
		payload["max_tokens"] = maxOutput + reasoningBudget
	}
	return payload
}

func anthropicSupportsThinking(model string) bool {
	name := strings.ToLower(model)
	return strings.Contains(name, "-3-7") || strings.Contains(name, "-4")
}

func (h *handler) directProvider(ctx context.Context, provider ai.Provider, model, key, system, user string, maxOutput int) (map[string]any, int, error) {
	var endpoint string
	var payload any
	headers := map[string]string{"Content-Type": "application/json"}
	switch provider {
	case ai.OpenAI:
		endpoint = "https://api.openai.com/v1/chat/completions"
		headers["Authorization"] = "Bearer " + key
		payload = openAIGeneratePayload(model, system, user, maxOutput)
	case ai.Google:
		endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent"
		headers["x-goog-api-key"] = key
		payload = googleGeneratePayload(model, system, user, maxOutput)
	case ai.Anthropic:
		endpoint = "https://api.anthropic.com/v1/messages"
		headers["x-api-key"] = key
		headers["anthropic-version"] = "2023-06-01"
		payload = anthropicGeneratePayload(model, system, user, maxOutput)
	default:
		return nil, 0, errors.New("unsupported AI provider")
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}
	send := func() (*http.Response, error) {
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(encoded)))
		if err != nil {
			return nil, err
		}
		for name, value := range headers {
			request.Header.Set(name, value)
		}
		return h.client.Do(request)
	}
	response, err := h.doProviderRequest(ctx, send)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 8*1024*1024+1))
	if err != nil {
		return nil, 0, err
	}
	if len(body) > 8*1024*1024 {
		return nil, 0, errors.New("AI provider response is too large")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, 0, &providerRequestError{
			Status: response.StatusCode,
			Message: fmt.Sprintf("AI provider request failed with status %d: %s",
				response.StatusCode, summarizeProviderError(body)),
		}
	}
	var envelope struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			TotalTokens  int `json:"total_tokens"`
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
		UsageMetadata struct {
			TotalTokens int `json:"totalTokenCount"`
		} `json:"usageMetadata"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, 0, errors.New("AI provider returned invalid JSON")
	}
	content := ""
	if len(envelope.Choices) > 0 {
		content = envelope.Choices[0].Message.Content
	}
	if len(envelope.Candidates) > 0 && len(envelope.Candidates[0].Content.Parts) > 0 {
		content = envelope.Candidates[0].Content.Parts[0].Text
	}
	if len(envelope.Content) > 0 {
		content = envelope.Content[0].Text
	}
	if strings.TrimSpace(content) == "" {
		return nil, 0, errors.New("AI provider returned no text content")
	}
	document, err := decodeGeneratedDocument(content)
	if err != nil {
		return nil, 0, err
	}
	tokens := envelope.Usage.TotalTokens
	if tokens == 0 {
		tokens = envelope.Usage.InputTokens + envelope.Usage.OutputTokens
	}
	if tokens == 0 {
		tokens = envelope.UsageMetadata.TotalTokens
	}
	return document, tokens, nil
}

// summarizeProviderError condenses an upstream error body into a bounded,
// single-line snippet so failure surfaces carry the provider's actual reason
// (invalid API keys, rejected parameters, quota text) instead of a bare status.
func summarizeProviderError(body []byte) string {
	snippet := strings.TrimSpace(string(body))
	if idx := strings.IndexByte(snippet, '\n'); idx >= 0 {
		snippet = snippet[:idx]
	}
	return truncate(snippet, 300)
}

func decodeGeneratedDocument(content string) (map[string]any, error) {
	content = strings.TrimSpace(content)
	// Some models emit reasoning inline as <think> blocks before the answer.
	if start := strings.Index(content, "<think>"); start >= 0 {
		if end := strings.Index(content[start:], "</think>"); end >= 0 {
			content = strings.TrimSpace(content[:start] + content[start+end+len("</think>"):])
		}
	}
	start, end := strings.IndexByte(content, '{'), strings.LastIndexByte(content, '}')
	if start < 0 || end < start {
		return nil, errors.New("AI provider returned invalid presentation JSON")
	}
	decoder := json.NewDecoder(strings.NewReader(content[start : end+1]))
	decoder.UseNumber()
	var document map[string]any
	if err := decoder.Decode(&document); err != nil || document == nil {
		return nil, errors.New("AI provider returned invalid presentation JSON")
	}
	return document, nil
}

func hasSubstantiveGeneratedContent(slides []any) bool {
	for _, value := range slides {
		slide, ok := value.(map[string]any)
		if !ok || slide["type"] != "content" {
			return false
		}
		blocks, ok := slide["blocks"].([]any)
		if !ok {
			return false
		}
		hasContent := false
		for _, value := range blocks {
			block, _ := value.(map[string]any)
			switch block["type"] {
			case "paragraph", "quote", "callout":
				content := strings.TrimSpace(text(block["text"], ""))
				if content != "" && content != "Content to be developed." {
					hasContent = true
				}
			case "bullets":
				if items, ok := block["items"].([]any); ok && len(items) > 0 {
					hasContent = true
				}
			}
		}
		if !hasContent {
			return false
		}
	}
	return len(slides) > 0
}

func (h *handler) body(writer http.ResponseWriter, request *http.Request, maximum int64) (string, map[string]any, bool) {
	userID, err := h.identity(request.Context(), request)
	if err != nil || strings.TrimSpace(userID) == "" {
		writeError(writer, http.StatusUnauthorized, "Authentication required")
		return "", nil, false
	}
	if request.ContentLength > maximum {
		writeError(writer, http.StatusRequestEntityTooLarge, "Request body is too large")
		return "", nil, false
	}
	raw, err := io.ReadAll(io.LimitReader(request.Body, maximum+1))
	if err != nil || int64(len(raw)) > maximum {
		writeError(writer, http.StatusRequestEntityTooLarge, "Request body is too large")
		return "", nil, false
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	var body map[string]any
	if decoder.Decode(&body) != nil || body == nil {
		writeError(writer, http.StatusBadRequest, "Invalid JSON body")
		return "", nil, false
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		writeError(writer, http.StatusBadRequest, "Invalid JSON body")
		return "", nil, false
	}
	return userID, body, true
}

func (h *handler) ownedPresentation(ctx context.Context, id, userID string) (persistedPresentation, error) {
	var item persistedPresentation
	err := h.database.QueryRowContext(ctx, `SELECT id, title, prompt, slides_data, revision FROM presentations WHERE id = $1 AND user_id = $2`, id, userID).Scan(&item.ID, &item.Title, &item.Prompt, &item.Data, &item.Revision)
	return item, err
}

// existingSubmission resolves a reused job ID against the committed job row:
// resubmitting the same body attaches to the existing job, a different body
// conflicts. The job row carries its own request hash.
func (h *handler) existingSubmission(ctx context.Context, userID, jobID, requestHash string) (duplicateOperation, error) {
	var existingHash string
	var duplicate duplicateOperation
	err := h.database.QueryRowContext(ctx, `SELECT COALESCE(payload->>'request_hash', ''), presentation_id FROM generation_jobs WHERE id = $1 AND user_id = $2`, jobID, userID).Scan(&existingHash, &duplicate.presentationID)
	if err != nil {
		return duplicateOperation{}, err
	}
	duplicate.jobID = jobID
	if existingHash != requestHash {
		return duplicateOperation{}, idempotencyConflict{}
	}
	return duplicate, nil
}

// enqueue atomically creates the authorization, placeholder, durable domain job,
// and River queue record. The job ID is the idempotency token: submissions of
// one user serialize on their balance row, so a repeated job ID attaches to the
// committed job instead of reserving points twice.
func (h *handler) enqueue(ctx context.Context, job streamJob, requestHash string, create bool, prompt string, data []byte) (int64, int, error) {
	if h.queue == nil {
		return 0, 0, errors.New("generation queue is unavailable")
	}
	if err := h.recoverExpired(ctx, job.userID); err != nil {
		return 0, 0, err
	}
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()
	// Serializing same-user submissions on this row makes the duplicate check
	// below safe without a separate advisory-lock protocol.
	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1 FOR UPDATE`, job.userID).Scan(&balance); err != nil {
		return 0, 0, err
	}
	var existingHash, existingPresentationID string
	err = tx.QueryRowContext(ctx, `SELECT COALESCE(payload->>'request_hash', ''), presentation_id FROM generation_jobs WHERE id = $1 AND user_id = $2`, job.jobID, job.userID).Scan(&existingHash, &existingPresentationID)
	if err == nil {
		if existingHash == requestHash {
			return 0, 0, duplicateOperation{jobID: job.jobID, presentationID: existingPresentationID}
		}
		return 0, 0, idempotencyConflict{}
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, 0, err
	}
	if balance < job.quote {
		return 0, 0, insufficient{balance: balance, required: job.quote}
	}
	if job.quote > 0 {
		if _, err := tx.ExecContext(ctx, `UPDATE users SET balance_millis = balance_millis - $1, updated_at = NOW() WHERE id = $2`, job.quote, job.userID); err != nil {
			return 0, 0, err
		}
		balance -= job.quote
	}
	revision := 0
	if create {
		if _, err := tx.ExecContext(ctx, `INSERT INTO presentations (id, user_id, title, prompt, slides_data) VALUES ($1, $2, $3, $4, $5::jsonb)`, job.presentationID, job.userID, "Generating...", prompt, data); err != nil {
			return 0, 0, err
		}
	} else if data != nil {
		if err := tx.QueryRowContext(ctx, `UPDATE presentations SET title = $1, prompt = $2, slides_data = $3::jsonb, revision = revision + 1, updated_at = NOW() WHERE id = $4 AND user_id = $5 AND slides_data->>'status' = 'failed' RETURNING revision`, "Generating...", prompt, data, job.presentationID, job.userID).Scan(&revision); err != nil {
			return 0, 0, err
		}
	} else {
		if err := tx.QueryRowContext(ctx, `SELECT revision FROM presentations WHERE id = $1 AND user_id = $2`, job.presentationID, job.userID).Scan(&revision); err != nil {
			return 0, 0, err
		}
	}
	job.expectedRevision = revision
	job.requestHash = requestHash
	payload, err := json.Marshal(payloadFromJob(job))
	if err != nil {
		return 0, 0, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO generation_point_operations (id, user_id, presentation_id, kind, idempotency_key, request_hash, pricing_version, quoted_millis, expires_at) VALUES ($1, $2, $3, $4, $5, $6, '2026-08-v1', $7, NOW() + INTERVAL '1 hour')`, job.operationID, job.userID, job.presentationID, job.kind, job.jobID, requestHash, job.quote)
	if err != nil {
		return 0, 0, err
	}
	if job.quote > 0 {
		entryType := "model_reservation"
		if job.kind == "research" {
			entryType = "research_reservation"
		}
		if err := recordLedger(tx, job.userID, job.operationID, entryType, -job.quote, balance); err != nil {
			return 0, 0, err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO generation_jobs (id, operation_id, user_id, presentation_id, kind, payload, expected_revision, status, stage, progress_completed, progress_total) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, 'queued', 'planning', 1, 3)`, job.jobID, job.operationID, job.userID, job.presentationID, job.kind, payload, revision); err != nil {
		return 0, 0, err
	}
	inserted, err := h.queue.InsertTx(ctx, tx, JobArgs{JobID: job.jobID}, nil)
	if err != nil {
		return 0, 0, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_jobs SET river_job_id = $1 WHERE id = $2`, inserted.Job.ID, job.jobID); err != nil {
		return 0, 0, err
	}
	if err := appendEventTx(ctx, tx, job.jobID, "created", map[string]any{"job_id": job.jobID, "presentation_id": job.presentationID}); err != nil {
		return 0, 0, err
	}
	if job.researchPayload != nil {
		if err := appendEventTx(ctx, tx, job.jobID, "research", map[string]any{"status": "ready", "sources": job.researchPayload.Sources}); err != nil {
			return 0, 0, err
		}
	}
	if err := appendEventTx(ctx, tx, job.jobID, "theme", map[string]any{"theme": job.theme}); err != nil {
		return 0, 0, err
	}
	if err := appendEventTx(ctx, tx, job.jobID, "stage", map[string]any{"stage": "planning", "message": "Preparing presentation", "completed": 1, "total": 3}); err != nil {
		return 0, 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	return balance, revision, nil
}

func settleTx(ctx context.Context, tx *sql.Tx, job streamJob, data []byte, title string, charged int64, providerTokens int) (int64, error) {
	result, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET status = 'settled', charged_millis = $1, provider_total_tokens = $2, finalized_at = NOW(), updated_at = NOW() WHERE id = $3 AND user_id = $4 AND presentation_id = $5 AND status = 'reserved' AND quoted_millis >= $1`, charged, providerTokens, job.operationID, job.userID, job.presentationID)
	if err != nil {
		return 0, err
	}
	affected, _ := result.RowsAffected()
	if affected != 1 {
		return 0, errInactiveReservation
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1 FOR UPDATE`, job.userID).Scan(&balance); err != nil {
		return 0, err
	}
	provider, selectedModel := "openrouter", model()
	if job.selection != nil {
		provider, selectedModel = string(job.selection.Provider), job.selection.Model
	}
	result, err = tx.ExecContext(ctx, `UPDATE presentations SET title = $1, prompt = $2, slides_data = $3::jsonb, ai_provider = $4, ai_model = $5, revision = revision + 1, updated_at = NOW() WHERE id = $6 AND user_id = $7 AND revision = $8`, title, job.prompt, data, provider, selectedModel, job.presentationID, job.userID, job.expectedRevision)
	if err != nil {
		return 0, err
	}
	affected, _ = result.RowsAffected()
	if affected != 1 {
		return 0, errPresentationChanged
	}
	refund := job.quote - charged
	if refund > 0 {
		if err := tx.QueryRowContext(ctx, `UPDATE users SET balance_millis = balance_millis + $1, updated_at = NOW() WHERE id = $2 RETURNING balance_millis`, refund, job.userID).Scan(&balance); err != nil {
			return 0, err
		}
	}
	if refund > 0 {
		if err := recordLedger(tx, job.userID, job.operationID, "reservation_release", refund, balance); err != nil {
			return 0, err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET balance_after_millis = $1 WHERE id = $2`, balance, job.operationID); err != nil {
		return 0, err
	}
	return balance, nil
}

func failTx(ctx context.Context, tx *sql.Tx, job streamJob, message string) error {
	refunded, err := refundReservationTx(ctx, tx, job.operationID, job.userID, message)
	if err != nil || !refunded {
		return err
	}

	if job.kind == "generation" {
		failed := map[string]any{
			"schemaVersion": presentation.PresentationSchemaVersion,
			"title":         "Generation failed",
			"theme":         job.theme,
			"slides":        []any{},
			"status":        "failed",
			"failure": map[string]any{
				"message": message,
				"retry": map[string]any{
					"prompt":           job.prompt,
					"slide_count":      job.slideCount,
					"detail_level":     job.detailLevel,
					"tonality":         job.tonality,
					"theme":            job.theme,
					"research_enabled": job.research != nil || job.researchPayload != nil,
					"research_payload": job.researchPayload,
					"ai":               job.selection,
				},
			},
		}
		data, _ := json.Marshal(failed)
		// Presentation state is secondary to the financial finalization. A user
		// edit or deletion must never retain a reserved balance.
		_, _ = tx.ExecContext(ctx, `UPDATE presentations SET title = $1, prompt = $2, slides_data = $3::jsonb, revision = revision + 1, updated_at = NOW() WHERE id = $4 AND user_id = $5 AND revision = $6`, "Generation failed", job.prompt, data, job.presentationID, job.userID, job.expectedRevision)
	}
	return nil
}

func refundReservationTx(ctx context.Context, tx *sql.Tx, operationID, userID, message string) (bool, error) {
	var quote int64
	err := tx.QueryRowContext(ctx, `UPDATE generation_point_operations SET status = 'refunded', charged_millis = 0, error_reason = $1, finalized_at = NOW(), updated_at = NOW() WHERE id = $2 AND user_id = $3 AND status = 'reserved' RETURNING quoted_millis`, message, operationID, userID).Scan(&quote)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, `UPDATE users SET balance_millis = balance_millis + $1, updated_at = NOW() WHERE id = $2 RETURNING balance_millis`, quote, userID).Scan(&balance); err != nil {
		return false, err
	}
	if quote > 0 {
		if err := recordLedger(tx, userID, operationID, "reservation_release", quote, balance); err != nil {
			return false, err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET balance_after_millis = $1 WHERE id = $2`, balance, operationID); err != nil {
		return false, err
	}
	return true, nil
}

func (h *handler) recoverExpired(ctx context.Context, userID string) error {
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT operation.id, operation.quoted_millis, operation.presentation_id, operation.kind FROM generation_point_operations operation WHERE operation.user_id = $1 AND operation.status = 'reserved' AND operation.expires_at <= NOW() AND NOT EXISTS (SELECT 1 FROM generation_jobs job WHERE job.operation_id = operation.id AND job.status IN ('queued', 'running', 'retrying')) ORDER BY operation.expires_at LIMIT 100 FOR UPDATE OF operation SKIP LOCKED`, userID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type expiredOperation struct {
		id, presentationID, kind string
		quote                    int64
	}
	expired := []expiredOperation{}
	for rows.Next() {
		var item expiredOperation
		if err := rows.Scan(&item.id, &item.quote, &item.presentationID, &item.kind); err != nil {
			return err
		}
		expired = append(expired, item)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if len(expired) == 0 {
		return tx.Commit()
	}
	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT balance_millis FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&balance); err != nil {
		return err
	}
	for _, item := range expired {
		result, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET status = 'refunded', charged_millis = 0, error_reason = 'lease expired', finalized_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'reserved'`, item.id)
		if err != nil {
			return err
		}
		affected, err := result.RowsAffected()
		if err != nil || affected != 1 {
			return errors.New("expired operation was not active")
		}
		balance += item.quote
		if err := recordLedger(tx, userID, item.id, "lease_release", item.quote, balance); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET balance_after_millis = $1 WHERE id = $2`, balance, item.id); err != nil {
			return err
		}
		if item.kind == "generation" && item.presentationID != "" {
			_, _ = tx.ExecContext(ctx, `UPDATE presentations SET title = 'Generation failed', slides_data = jsonb_set(jsonb_set(slides_data, '{status}', '"failed"'::jsonb, true), '{failure,message}', to_jsonb('Generation was interrupted before completion'::text), true), revision = revision + 1, updated_at = NOW() WHERE id = $1 AND slides_data->>'status' = 'generating'`, item.presentationID)
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET balance_millis = $1, updated_at = NOW() WHERE id = $2`, balance, userID); err != nil {
		return err
	}
	return tx.Commit()
}

func recordLedger(tx *sql.Tx, userID, operationID, entryType string, delta, balance int64) error {
	if delta == 0 {
		return nil
	}
	_, err := tx.Exec(`INSERT INTO point_ledger (id, user_id, operation_id, entry_type, delta_millis, balance_after_millis) VALUES (md5(random()::text || clock_timestamp()::text), $1, $2, $3, $4, $5)`, userID, operationID, entryType, delta, balance)
	return err
}

type duplicateOperation struct {
	jobID, presentationID string
}

func (duplicateOperation) Error() string { return "duplicate operation" }

type idempotencyConflict struct{}

func (idempotencyConflict) Error() string { return "idempotency conflict" }

func validateIdempotencyKey(value string) (string, error) {
	key := strings.TrimSpace(value)
	if len(key) < 16 || len(key) > 128 {
		return "", errors.New("Idempotency-Key must contain 16-128 characters")
	}
	for _, character := range key {
		if !(character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' || character >= '0' && character <= '9' || character == '-' || character == '_' || character == '.') {
			return "", errors.New("Idempotency-Key contains invalid characters")
		}
	}
	return key, nil
}

func requestHash(value any) string {
	encoded, _ := json.Marshal(value)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func authorizationMillis(slideCount int, prompt string, current json.RawMessage, research any, payload *presentation.ResearchPayload, planningOutputTokens int) int64 {
	encodedResearch, _ := json.Marshal(research)
	encodedSources, _ := json.Marshal(payload)
	inputBytes := len(generationSystemPrompt) + len(prompt) + len(current) + len(encodedResearch) + len(encodedSources) + 256
	// The validated plan becomes part of the drafting input after the planning
	// call, so reserve for its bounded output a second time as prompt context.
	inputTokens := (inputBytes+3)/4 + planningOutputTokens
	outputTokens := maxOutputTokens(slideCount) + planningOutputTokens
	// The provider may add protocol tokens beyond the serialized prompt. The
	// buffer makes the authorization a real maximum while settlement charges the
	// provider's exact aggregate usage.
	return int64(outputTokens + (inputTokens*12+9)/10)
}

func maxOutputTokens(slideCount int) int {
	outputTokens := slideCount * 1200
	if outputTokens < 2000 {
		return 2000
	}
	if outputTokens > 16000 {
		return 16000
	}
	return outputTokens
}

func maxPlanOutputTokens(slideCount int) int {
	outputTokens := 600 + slideCount*240
	if outputTokens > 4000 {
		return 4000
	}
	return outputTokens
}

func points(millis int64) float64 {
	return float64(millis) / 1000
}

type insufficient struct{ balance, required int64 }

func (e insufficient) Error() string { return "Insufficient points" }
func (h *handler) reservationError(writer http.ResponseWriter, err error) {
	var funds insufficient
	if errors.As(err, &funds) {
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusPaymentRequired)
		_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]string{"message": funds.Error(), "code": "INSUFFICIENT_TOKENS"}, "slide_tokens_remaining": points(funds.balance), "slide_tokens_required": points(funds.required), "slide_tokens_shortfall": points(funds.required - funds.balance)})
		return
	}
	var duplicate duplicateOperation
	if errors.As(err, &duplicate) {
		writeError(writer, http.StatusConflict, "This request is already being processed")
		return
	}
	var conflict idempotencyConflict
	if errors.As(err, &conflict) {
		writeError(writer, http.StatusConflict, "Idempotency key was reused with a different request")
		return
	}
	writeError(writer, http.StatusInternalServerError, "Unable to reserve generation points")
}

func writeError(writer http.ResponseWriter, status int, message string) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]string{"message": message}})
}
func required(value any, field string) (string, error) {
	valueText, ok := value.(string)
	valueText = strings.TrimSpace(valueText)
	if !ok || len(valueText) == 0 || len(valueText) > 400 {
		return "", fmt.Errorf("%s must contain between 1 and 400 characters", field)
	}
	return valueText, nil
}
func parseResearch(value any) (any, error) {
	if value == nil {
		return nil, nil
	}
	options, err := presentation.ParseResearchOptions(value)
	if err != nil {
		return nil, err
	}
	if !options.Enabled {
		return nil, nil
	}
	return options, nil
}
func slideCount(body map[string]any, mandatory bool) (int, error) {
	value := first(body, "slide_count", "slideCount")
	if value == nil && !mandatory {
		return 0, nil
	}
	number, ok := value.(json.Number)
	parsed, err := number.Int64()
	if !ok || err != nil || parsed < 1 || parsed > 40 {
		return 0, errors.New("slide_count must be an integer between 1 and 40")
	}
	return int(parsed), nil
}
func first(body map[string]any, keys ...string) any {
	for _, key := range keys {
		if value, ok := body[key]; ok {
			return value
		}
	}
	return nil
}
func text(value any, fallback string) string {
	result, ok := value.(string)
	result = strings.TrimSpace(result)
	if !ok || result == "" {
		return fallback
	}
	return result
}
func choice(primary, secondary any, fallback string, allowed ...string) string {
	value := primary
	if value == nil {
		value = secondary
	}
	if value == nil {
		return fallback
	}
	return text(value, "")
}
func validDetail(value string) bool {
	for _, candidate := range []string{"brief", "concise", "balanced", "detailed", "comprehensive"} {
		if value == candidate {
			return true
		}
	}
	return false
}
func validTonality(value string) bool {
	for _, candidate := range []string{"casual", "professional", "enthusiastic", "persuasive"} {
		if value == candidate {
			return true
		}
	}
	return false
}
func estimate(slides int, detail, tonality string, researchTokens int) float64 {
	detailMultiplier := map[string]float64{"brief": .6, "concise": .8, "balanced": 1, "detailed": 2, "comprehensive": 2.5}[detail]
	if detailMultiplier == 0 {
		detailMultiplier = 1
	}
	toneMultiplier := map[string]float64{"casual": .9, "professional": 1, "enthusiastic": 1.05, "persuasive": 1.1}[tonality]
	if toneMultiplier == 0 {
		toneMultiplier = 1
	}
	return math.Round((float64(slides)*detailMultiplier*toneMultiplier+float64(researchTokens)/1000)*10) / 10
}
func actualCharge(tokens int, quote int64) int64 {
	if quote == 0 || tokens <= 0 {
		return 0
	}
	charge := int64(tokens)
	if charge > quote {
		return quote
	}
	return charge
}
func documentTheme(data []byte) string {
	var document map[string]any
	_ = json.Unmarshal(data, &document)
	return text(document["theme"], "corporate-blue")
}
func outline(title string, slides []any) map[string]any {
	cards := make([]map[string]any, 0, len(slides))
	for index, slide := range slides {
		object, _ := slide.(map[string]any)
		cardTitle := text(object["title"], fmt.Sprintf("Slide %d", index+1))
		cards = append(cards, map[string]any{"id": text(object["id"], fmt.Sprintf("slide-%d", index+1)), "title": cardTitle, "objective": cardTitle, "keyPoints": []any{}, "narrativeRole": narrativeRole(index, len(slides)), "visualIntent": "none", "sourceIds": []any{}})
	}
	return map[string]any{"title": title, "audience": "General audience", "thesis": title, "cards": cards}
}
func narrativeRole(index, total int) string {
	if index == 0 {
		return "opening"
	}
	if index == total-1 {
		return "closing"
	}
	return "insight"
}
func truncate(value string, maximum int) string {
	if len(value) > maximum {
		return value[:maximum]
	}
	return value
}
func model() string {
	value := strings.TrimSpace(os.Getenv("OPEN_ROUTER_MODEL"))
	if value == "" {
		return defaultModel
	}
	return value
}
func uuid() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	bytes[6] = bytes[6]&0x0f | 0x40
	bytes[8] = bytes[8]&0x3f | 0x80
	encoded := hex.EncodeToString(bytes)
	return encoded[0:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:], nil
}

func parseAISelection(value any) (*ai.Selection, error) {
	if value == nil {
		return nil, nil
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, errors.New("ai must be an object")
	}
	provider, providerOK := object["provider"].(string)
	selectedModel, modelOK := object["model"].(string)
	selection := &ai.Selection{Provider: ai.Provider(strings.TrimSpace(provider)), Model: strings.TrimSpace(selectedModel)}
	if !providerOK || !modelOK || selection.Model == "" || selection.Provider != ai.OpenAI && selection.Provider != ai.Google && selection.Provider != ai.Anthropic {
		return nil, errors.New("Invalid AI model selection")
	}
	return selection, nil
}
