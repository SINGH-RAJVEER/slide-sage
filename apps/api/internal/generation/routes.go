// Package generation implements direct, persisted presentation generation routes.
package generation

import (
	"bufio"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/ai"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
)

const (
	maxBodyBytes           = 256 * 1024
	defaultModel           = "google/gemma-4-26b-a4b-it"
	generationSystemPrompt = `Return exactly one JSON object and no Markdown.
The object must contain title, theme, and slides. Every slide must use type "content" and contain id, layout, title, subtitle, tone, density, pattern, and a top-level blocks array. Every slide must contain at least one substantive text block.
Use only these exact block shapes:
- {"type":"paragraph","region":"main","text":"Concise presentation copy"}
- {"type":"bullets","region":"main","items":["Specific point"],"ordered":false}
- {"type":"quote","region":"main","text":"Quote","attribution":"Source"}
- {"type":"callout","region":"main","heading":"Key point","text":"Supporting detail"}
- {"type":"image-placeholder","region":"media","alt":"Description of a useful visual","caption":"Optional caption"}
Block region must be main, primary, secondary, or media. Do not rename text or items, do not nest blocks under content, and do not return empty blocks. Never return HTML, Markdown, CSS, code, styles, class names, coordinates, or arbitrary colors.`
)

type Identity func(context.Context, *http.Request) (string, error)

// RegisterRoutes installs the direct OpenRouter-backed generation endpoints.
func RegisterRoutes(mux *http.ServeMux, database *sql.DB, identity Identity, connections ai.ConnectionService) {
	if mux == nil || database == nil || identity == nil {
		panic("generation routes require mux, database, and identity callback")
	}
	handler := &handler{database: database, identity: identity, connections: connections, client: &http.Client{Timeout: 3 * time.Minute}}
	mux.HandleFunc("POST /generate-presentation-stream", handler.generate)
	mux.HandleFunc("POST /iterate-presentation-stream", handler.iterate)
}

type handler struct {
	database    *sql.DB
	identity    Identity
	client      *http.Client
	connections ai.ConnectionService
}

type generationInput struct {
	Topic           string
	SlideCount      int
	DetailLevel     string
	Tonality        string
	Theme           string
	Research        any
	ResearchPayload *presentation.ResearchPayload
	AI              *ai.Selection
	RetryID         string
}

type iterationInput struct {
	PresentationID string
	Feedback       string
	SlideCount     int
	DetailLevel    string
	Tonality       string
	Research       any
	AI             *ai.Selection
}

type persistedPresentation struct {
	ID       string
	Title    string
	Prompt   string
	Data     json.RawMessage
	Revision int
}

func (h *handler) generate(writer http.ResponseWriter, request *http.Request) {
	userID, input, ok := h.generationRequest(writer, request)
	if !ok {
		return
	}
	presentationID := input.RetryID
	if presentationID != "" {
		existing, err := h.ownedPresentation(request.Context(), presentationID, userID)
		if err != nil {
			writeError(writer, http.StatusNotFound, "Presentation not found")
			return
		}
		var document map[string]any
		_ = json.Unmarshal(existing.Data, &document)
		if document["status"] != "failed" {
			writeError(writer, http.StatusConflict, "Only failed presentations can be retried")
			return
		}
	}
	researchTokens := 0
	if input.ResearchPayload != nil {
		encoded, _ := json.Marshal(input.ResearchPayload.Sources)
		researchTokens = (len(encoded) + 3) / 4
	}
	quote := estimate(input.SlideCount, input.DetailLevel, input.Tonality, researchTokens)
	operationID, err := uuid()
	if err != nil {
		writeError(writer, http.StatusInternalServerError, "Unable to start generation")
		return
	}
	if presentationID == "" {
		presentationID, err = uuid()
		if err != nil {
			writeError(writer, http.StatusInternalServerError, "Unable to start generation")
			return
		}
	}
	selection, credential, err := h.connections.CredentialForGeneration(request.Context(), userID, input.AI)
	if err != nil {
		writeError(writer, http.StatusConflict, err.Error())
		return
	}
	if selection != nil {
		quote = 0
	}
	initial := map[string]any{"schemaVersion": presentation.PresentationSchemaVersion, "title": "Generating...", "theme": input.Theme, "dimensions": map[string]int{"width": 1280, "height": 720}, "slides": []any{}, "status": "generating", "failure": map[string]any{"retry": map[string]any{"prompt": input.Topic, "slide_count": input.SlideCount, "detail_level": input.DetailLevel, "tonality": input.Tonality, "theme": input.Theme, "research_enabled": input.Research != nil || input.ResearchPayload != nil, "research_payload": input.ResearchPayload, "ai": input.AI}}}
	initialJSON, _ := json.Marshal(initial)
	balance, revision, err := h.reserve(request.Context(), operationID, userID, presentationID, "generation", quote, input.RetryID == "", input.Topic, initialJSON)
	if err != nil {
		h.reservationError(writer, err)
		return
	}
	h.stream(writer, request, streamJob{userID: userID, operationID: operationID, presentationID: presentationID, expectedRevision: revision, quote: quote, balance: balance, prompt: input.Topic, slideCount: input.SlideCount, detailLevel: input.DetailLevel, tonality: input.Tonality, theme: input.Theme, research: input.Research, researchPayload: input.ResearchPayload, selection: selection, credential: credential, kind: "generation"})
}

func (h *handler) iterate(writer http.ResponseWriter, request *http.Request) {
	userID, input, ok := h.iterationRequest(writer, request)
	if !ok {
		return
	}
	base, err := h.ownedPresentation(request.Context(), input.PresentationID, userID)
	if err != nil {
		writeError(writer, http.StatusNotFound, "Presentation not found")
		return
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
		writeError(writer, http.StatusInternalServerError, "Unable to start iteration")
		return
	}
	quote := estimate(count, input.DetailLevel, input.Tonality, 0)
	selection, credential, err := h.connections.CredentialForGeneration(request.Context(), userID, input.AI)
	if err != nil {
		writeError(writer, http.StatusConflict, err.Error())
		return
	}
	if selection != nil {
		quote = 0
	}
	balance, _, err := h.reserve(request.Context(), operationID, userID, base.ID, "iteration", quote, false, "", nil)
	if err != nil {
		h.reservationError(writer, err)
		return
	}
	h.stream(writer, request, streamJob{userID: userID, operationID: operationID, presentationID: base.ID, expectedRevision: base.Revision, quote: quote, balance: balance, prompt: input.Feedback, slideCount: count, detailLevel: input.DetailLevel, tonality: input.Tonality, theme: documentTheme(base.Data), research: input.Research, selection: selection, credential: credential, current: base.Data, kind: "iteration"})
}

type streamJob struct {
	userID, operationID, presentationID string
	expectedRevision                    int
	quote, balance                      float64
	prompt                              string
	slideCount                          int
	detailLevel, tonality, theme, kind  string
	research                            any
	researchPayload                     *presentation.ResearchPayload
	selection                           *ai.Selection
	credential                          string
	current                             json.RawMessage
}

func (h *handler) stream(writer http.ResponseWriter, request *http.Request, job streamJob) {
	flusher, ok := writer.(http.Flusher)
	if !ok {
		writeError(writer, http.StatusInternalServerError, "Streaming is unavailable")
		h.cleanup(request.Context(), func(ctx context.Context) { _ = h.fail(ctx, job, "Streaming is unavailable") })
		return
	}
	writer.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-cache, no-transform")
	writer.Header().Set("X-Accel-Buffering", "no")
	writeEvent(writer, flusher, "created", map[string]any{"presentation_id": job.presentationID})
	if job.researchPayload != nil {
		writeEvent(writer, flusher, "research", map[string]any{"status": "ready", "sources": job.researchPayload.Sources})
	}
	writeEvent(writer, flusher, "theme", map[string]any{"theme": job.theme})
	writeEvent(writer, flusher, "stage", map[string]any{"stage": "planning", "message": "Structuring the narrative", "completed": 1, "total": 3})

	document, tokens, err := h.generateWithKeepalive(writer, flusher, request.Context(), job)
	if err != nil {
		h.cleanup(request.Context(), func(ctx context.Context) { _ = h.fail(ctx, job, err.Error()) })
		writeEvent(writer, flusher, "error", map[string]any{"error": "Presentation generation failed. Please try again.", "presentation_id": job.presentationID})
		return
	}
	document["schemaVersion"] = presentation.PresentationSchemaVersion
	document["title"] = truncate(text(document["title"], "Untitled Presentation"), 255)
	document["theme"] = text(document["theme"], job.theme)
	document["status"] = "ready"
	document["tokens_used"] = tokens
	rawSlides, slidesOK := document["slides"].([]any)
	if !slidesOK || len(rawSlides) < job.slideCount {
		h.cleanup(request.Context(), func(ctx context.Context) { _ = h.fail(ctx, job, "The provider returned fewer slides than requested") })
		writeEvent(writer, flusher, "error", map[string]any{"error": "The provider returned an incomplete presentation", "presentation_id": job.presentationID})
		return
	}
	if len(rawSlides) > job.slideCount {
		document["slides"] = rawSlides[:job.slideCount]
	}
	if job.researchPayload != nil {
		document["sources"] = job.researchPayload.Sources
	}
	document, err = presentation.NormalizeDocument(document)
	slides, ok := document["slides"].([]any)
	if !ok || len(slides) == 0 || !hasSubstantiveGeneratedContent(slides) {
		h.cleanup(request.Context(), func(ctx context.Context) { _ = h.fail(ctx, job, "Generated presentation was invalid") })
		writeEvent(writer, flusher, "error", map[string]any{"error": "Failed to generate valid presentation content", "presentation_id": job.presentationID})
		return
	}
	title := text(document["title"], "Untitled Presentation")
	writeEvent(writer, flusher, "outline", outline(title, slides))
	writeEvent(writer, flusher, "stage", map[string]any{"stage": "drafting", "message": "Writing slide content", "completed": 2, "total": 3})
	for index, slide := range slides {
		writeEvent(writer, flusher, "slide", map[string]any{"index": index, "slide": slide, "title": title})
	}
	completed, _ := json.Marshal(document)
	charged := actualCharge(tokens, job.quote)
	balance, err := h.settle(request.Context(), job, completed, truncate(title, 255), charged)
	if err != nil {
		h.cleanup(request.Context(), func(ctx context.Context) { _ = h.fail(ctx, job, "Unable to save presentation") })
		writeEvent(writer, flusher, "error", map[string]any{"error": "Unable to save presentation", "presentation_id": job.presentationID})
		return
	}
	writeEvent(writer, flusher, "complete", document)
	writeEvent(writer, flusher, "stage", map[string]any{"stage": "finalizing", "message": "Saving presentation", "completed": 3, "total": 3})
	writeEvent(writer, flusher, "saved", map[string]any{"presentation_id": job.presentationID, "success": true, "slide_tokens_remaining": balance, "slide_tokens_charged": charged})
	if job.selection != nil {
		_ = h.connections.MarkUsed(context.WithoutCancel(request.Context()), job.userID, job.selection.Provider)
	}
}

type generationResult struct {
	document map[string]any
	tokens   int
	err      error
}

func (h *handler) generateWithKeepalive(writer http.ResponseWriter, flusher http.Flusher, ctx context.Context, job streamJob) (map[string]any, int, error) {
	result := make(chan generationResult, 1)
	go func() {
		document, tokens, err := h.generateDocument(ctx, job)
		result <- generationResult{document: document, tokens: tokens, err: err}
	}()
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case generated := <-result:
			return generated.document, generated.tokens, generated.err
		case <-ticker.C:
			_, _ = io.WriteString(writer, ": keepalive\n\n")
			flusher.Flush()
		case <-ctx.Done():
			return nil, 0, ctx.Err()
		}
	}
}

func (h *handler) generateDocument(ctx context.Context, job streamJob) (map[string]any, int, error) {
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
	system := generationSystemPrompt
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
	if provider != "openrouter" {
		return h.directProvider(ctx, provider, model, key, system, user)
	}
	payload := map[string]any{"model": model, "stream": true, "stream_options": map[string]bool{"include_usage": true}, "response_format": map[string]string{"type": "json_object"}, "messages": []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": user}}}
	encoded, _ := json.Marshal(payload)
	endpoint := strings.TrimSpace(os.Getenv("OPEN_ROUTER_API_BASE"))
	if endpoint == "" {
		endpoint = "https://openrouter.ai/api/v1/chat/completions"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(encoded)))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", strings.TrimSpace(os.Getenv("BASE_URL")))
	req.Header.Set("X-OpenRouter-Title", "Slide Sage")
	response, err := h.client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 16*1024))
		return nil, 0, fmt.Errorf("OpenRouter request failed: %s", strings.TrimSpace(string(body)))
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

func (h *handler) directProvider(ctx context.Context, provider ai.Provider, model, key, system, user string) (map[string]any, int, error) {
	var endpoint string
	var payload any
	headers := map[string]string{"Content-Type": "application/json"}
	switch provider {
	case ai.OpenAI:
		endpoint = "https://api.openai.com/v1/chat/completions"
		headers["Authorization"] = "Bearer " + key
		payload = map[string]any{"model": model, "response_format": map[string]string{"type": "json_object"}, "messages": []map[string]string{{"role": "system", "content": system}, {"role": "user", "content": user}}}
	case ai.Google:
		endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent"
		headers["x-goog-api-key"] = key
		payload = map[string]any{"systemInstruction": map[string]any{"parts": []map[string]string{{"text": system}}}, "contents": []map[string]any{{"role": "user", "parts": []map[string]string{{"text": user}}}}, "generationConfig": map[string]string{"responseMimeType": "application/json"}}
	case ai.Anthropic:
		endpoint = "https://api.anthropic.com/v1/messages"
		headers["x-api-key"] = key
		headers["anthropic-version"] = "2023-06-01"
		payload = map[string]any{"model": model, "max_tokens": 32768, "system": system, "messages": []map[string]string{{"role": "user", "content": user}}}
	default:
		return nil, 0, errors.New("unsupported AI provider")
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(encoded)))
	if err != nil {
		return nil, 0, err
	}
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	response, err := h.client.Do(request)
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
		return nil, 0, fmt.Errorf("AI provider request failed with status %d", response.StatusCode)
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

func decodeGeneratedDocument(content string) (map[string]any, error) {
	content = strings.TrimSpace(content)
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

func (h *handler) generationRequest(writer http.ResponseWriter, request *http.Request) (string, generationInput, bool) {
	userID, body, ok := h.body(writer, request, maxBodyBytes)
	if !ok {
		return "", generationInput{}, false
	}
	topic, err := required(body["topic"], "topic")
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return "", generationInput{}, false
	}
	slides, err := slideCount(body, true)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return "", generationInput{}, false
	}
	research, err := parseResearch(body["research"])
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return "", generationInput{}, false
	}
	input := generationInput{Topic: topic, SlideCount: slides, DetailLevel: choice(body["detail_level"], body["detailLevel"], "balanced", "brief", "concise", "balanced", "detailed", "comprehensive"), Tonality: choice(body["tonality"], nil, "professional", "casual", "professional", "enthusiastic", "persuasive"), Theme: text(body["theme"], "corporate-blue"), Research: research}
	if !validDetail(input.DetailLevel) || !validTonality(input.Tonality) || len(input.Theme) > 100 {
		writeError(writer, http.StatusBadRequest, "Invalid generation options")
		return "", generationInput{}, false
	}
	input.RetryID = text(first(body, "retry_presentation_id", "retryPresentationId"), "")
	if len(input.RetryID) > 200 {
		writeError(writer, http.StatusBadRequest, "retry_presentation_id must be a non-empty string")
		return "", generationInput{}, false
	}
	if value := first(body, "research_payload", "researchPayload"); value != nil {
		payload, err := presentation.ParseResearchPayload(value)
		if err != nil {
			writeError(writer, http.StatusBadRequest, err.Error())
			return "", generationInput{}, false
		}
		input.ResearchPayload = &payload
	}
	selection, err := parseAISelection(body["ai"])
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return "", generationInput{}, false
	}
	input.AI = selection
	return userID, input, true
}

func (h *handler) iterationRequest(writer http.ResponseWriter, request *http.Request) (string, iterationInput, bool) {
	userID, body, ok := h.body(writer, request, 32*1024)
	if !ok {
		return "", iterationInput{}, false
	}
	id := text(first(body, "parent_presentation_id", "presentation_id", "parentPresentationId", "presentationId"), "")
	feedback, err := required(first(body, "feedback", "topic", "prompt"), "feedback")
	if id == "" || len(id) > 200 {
		writeError(writer, http.StatusBadRequest, "presentation_id must be a non-empty string")
		return "", iterationInput{}, false
	}
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return "", iterationInput{}, false
	}
	count, err := slideCount(body, false)
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return "", iterationInput{}, false
	}
	research, err := parseResearch(body["research"])
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return "", iterationInput{}, false
	}
	input := iterationInput{PresentationID: id, Feedback: feedback, SlideCount: count, DetailLevel: choice(body["detail_level"], body["detailLevel"], "balanced", "brief", "concise", "balanced", "detailed", "comprehensive"), Tonality: choice(body["tonality"], nil, "professional", "casual", "professional", "enthusiastic", "persuasive"), Research: research}
	if !validDetail(input.DetailLevel) || !validTonality(input.Tonality) {
		writeError(writer, http.StatusBadRequest, "Invalid iteration options")
		return "", iterationInput{}, false
	}
	input.AI, err = parseAISelection(body["ai"])
	if err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return "", iterationInput{}, false
	}
	return userID, input, true
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

// reserve atomically creates the reservation and, for generation, its placeholder deck.
func (h *handler) reserve(ctx context.Context, operationID, userID, presentationID, kind string, quote float64, create bool, prompt string, data []byte) (float64, int, error) {
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()
	var balance float64
	if err := tx.QueryRowContext(ctx, `SELECT slide_tokens FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&balance); err != nil {
		return 0, 0, err
	}
	var recovered float64
	if err := tx.QueryRowContext(ctx, `WITH expired AS (UPDATE generation_point_operations SET status = 'refunded', charged_points = 0, finalized_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND status = 'reserved' AND expires_at <= NOW() RETURNING presentation_id, quoted_points, kind), failed AS (UPDATE presentations p SET title = 'Generation failed', slides_data = jsonb_set(jsonb_set(p.slides_data, '{status}', '"failed"'::jsonb, true), '{failure,message}', to_jsonb('Generation was interrupted before completion'::text), true), revision = revision + 1, updated_at = NOW() FROM expired e WHERE e.kind = 'generation' AND p.id = e.presentation_id AND p.slides_data->>'status' = 'generating' RETURNING p.id) SELECT COALESCE(SUM(quoted_points), 0) FROM expired`, userID).Scan(&recovered); err != nil {
		return 0, 0, err
	}
	if recovered > 0 {
		if _, err := tx.ExecContext(ctx, `UPDATE users SET slide_tokens = slide_tokens + $1, updated_at = NOW() WHERE id = $2`, recovered, userID); err != nil {
			return 0, 0, err
		}
		balance += recovered
	}
	if balance < quote {
		return 0, 0, insufficient{balance: balance, required: quote}
	}
	if quote > 0 {
		if _, err := tx.ExecContext(ctx, `UPDATE users SET slide_tokens = slide_tokens - $1, updated_at = NOW() WHERE id = $2`, quote, userID); err != nil {
			return 0, 0, err
		}
		balance -= quote
	}
	revision := 0
	if create {
		if _, err := tx.ExecContext(ctx, `INSERT INTO presentations (id, user_id, title, prompt, slides_data) VALUES ($1, $2, $3, $4, $5::jsonb)`, presentationID, userID, "Generating...", prompt, data); err != nil {
			return 0, 0, err
		}
	} else if data != nil {
		if err := tx.QueryRowContext(ctx, `UPDATE presentations SET title = $1, prompt = $2, slides_data = $3::jsonb, revision = revision + 1, updated_at = NOW() WHERE id = $4 AND user_id = $5 AND slides_data->>'status' = 'failed' RETURNING revision`, "Generating...", prompt, data, presentationID, userID).Scan(&revision); err != nil {
			return 0, 0, err
		}
	} else {
		if err := tx.QueryRowContext(ctx, `SELECT revision FROM presentations WHERE id = $1 AND user_id = $2`, presentationID, userID).Scan(&revision); err != nil {
			return 0, 0, err
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO generation_point_operations (id, user_id, presentation_id, kind, quoted_points, expires_at) VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour')`, operationID, userID, presentationID, kind, quote)
	if err != nil {
		return 0, 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}
	return balance, revision, nil
}

func (h *handler) settle(ctx context.Context, job streamJob, data []byte, title string, charged float64) (float64, error) {
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET status = 'settled', charged_points = $1, finalized_at = NOW(), updated_at = NOW() WHERE id = $2 AND user_id = $3 AND presentation_id = $4 AND status = 'reserved' AND quoted_points >= $1`, charged, job.operationID, job.userID, job.presentationID)
	if err != nil {
		return 0, err
	}
	affected, _ := result.RowsAffected()
	if affected != 1 {
		return 0, errors.New("Generation point reservation is not active")
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
		return 0, errors.New("Presentation changed while generation was running")
	}
	refund := job.quote - charged
	if refund > 0 {
		_, err = tx.ExecContext(ctx, `UPDATE users SET slide_tokens = slide_tokens + $1, updated_at = NOW() WHERE id = $2`, refund, job.userID)
		if err != nil {
			return 0, err
		}
	}
	var balance float64
	if err := tx.QueryRowContext(ctx, `SELECT slide_tokens FROM users WHERE id = $1`, job.userID).Scan(&balance); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET balance_after = $1 WHERE id = $2`, balance, job.operationID); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return balance, nil
}

func (h *handler) fail(ctx context.Context, job streamJob, message string) error {
	tx, err := h.database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

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
		result, err := tx.ExecContext(ctx, `UPDATE presentations SET title = $1, prompt = $2, slides_data = $3::jsonb, revision = revision + 1, updated_at = NOW() WHERE id = $4 AND user_id = $5 AND revision = $6`, "Generation failed", job.prompt, data, job.presentationID, job.userID, job.expectedRevision)
		if err != nil {
			return err
		}
		affected, err := result.RowsAffected()
		if err != nil || affected != 1 {
			return errors.New("Presentation changed while generation was running")
		}
	}

	var quote float64
	err = tx.QueryRowContext(ctx, `UPDATE generation_point_operations SET status = 'refunded', charged_points = 0, finalized_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND status = 'reserved' RETURNING quoted_points`, job.operationID, job.userID).Scan(&quote)
	if errors.Is(err, sql.ErrNoRows) {
		return tx.Commit()
	}
	if err != nil {
		return err
	}
	if quote > 0 {
		if _, err := tx.ExecContext(ctx, `UPDATE users SET slide_tokens = slide_tokens + $1, updated_at = NOW() WHERE id = $2`, quote, job.userID); err != nil {
			return err
		}
	}
	var balance float64
	if err := tx.QueryRowContext(ctx, `SELECT slide_tokens FROM users WHERE id = $1`, job.userID).Scan(&balance); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE generation_point_operations SET balance_after = $1 WHERE id = $2`, balance, job.operationID); err != nil {
		return err
	}
	return tx.Commit()
}

type insufficient struct{ balance, required float64 }

func (e insufficient) Error() string { return "Insufficient points" }
func (h *handler) reservationError(writer http.ResponseWriter, err error) {
	var points insufficient
	if errors.As(err, &points) {
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusPaymentRequired)
		_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]string{"message": points.Error(), "code": "INSUFFICIENT_TOKENS"}, "slide_tokens_remaining": points.balance, "slide_tokens_required": points.required, "slide_tokens_shortfall": points.required - points.balance})
		return
	}
	writeError(writer, http.StatusInternalServerError, "Unable to reserve generation points")
}

func writeEvent(writer http.ResponseWriter, flusher http.Flusher, event string, data any) {
	encoded, _ := json.Marshal(data)
	_, _ = fmt.Fprintf(writer, "event: %s\ndata: %s\n\n", event, encoded)
	flusher.Flush()
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
	object, ok := value.(map[string]any)
	if !ok {
		return nil, errors.New("research must be an object")
	}
	enabled, ok := object["enabled"].(bool)
	if !ok {
		return nil, errors.New("research.enabled must be a boolean")
	}
	if !enabled {
		return nil, nil
	}
	return object, nil
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
func actualCharge(tokens int, quote float64) float64 {
	if quote == 0 {
		return 0
	}
	if tokens <= 0 {
		return quote
	}
	charge := float64(tokens) / 1000
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

func (h *handler) cleanup(parent context.Context, action func(context.Context)) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(parent), 10*time.Second)
	defer cancel()
	action(ctx)
}
