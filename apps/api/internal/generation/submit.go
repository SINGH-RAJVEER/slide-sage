package generation

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/integrations/ai"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
)

type submitInput struct {
	Topic           string
	ParentID        string
	RetryID         string
	SlideCount      int
	DetailLevel     string
	Tonality        string
	Research        any
	ResearchPayload *presentation.ResearchPayload
	AI              *ai.Selection
	Template        *presentation.TemplateReference
	Theme           string
}

type persistedPresentation struct {
	ID       string
	Title    string
	Prompt   string
	Data     json.RawMessage
	Revision int
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
	jobID := text(body["job_id"], "")
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
		job, err = h.iterationJob(request.Context(), userID, input, jobID)
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

// parseSubmitInput validates the unified submission body. A parent_presentation_id
// marks an iteration of an existing deck; retry_presentation_id resubmits a
// failed generation; neither means a fresh generation.
func parseSubmitInput(body map[string]any) (submitInput, error) {
	topic, err := required(body["topic"], "topic")
	if err != nil {
		return submitInput{}, err
	}
	input := submitInput{Topic: topic}
	input.ParentID = text(body["parent_presentation_id"], "")
	input.RetryID = text(body["retry_presentation_id"], "")
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
	input.DetailLevel = choice(body["detail_level"], "balanced")
	input.Tonality = choice(body["tonality"], "professional")
	if !validDetail(input.DetailLevel) || !validTonality(input.Tonality) {
		return submitInput{}, errors.New("Invalid generation options")
	}
	if value := body["research_payload"]; value != nil {
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
	input.Theme = "corporate-blue"
	if value, found := body["theme"]; found {
		theme, err := presentation.ParseTheme(value)
		if err != nil {
			return submitInput{}, err
		}
		input.Theme = theme
	}
	if value, found := body["template"]; found {
		template, err := presentation.ParseTemplateReference(value)
		if err != nil {
			return submitInput{}, err
		}
		input.Template = &template
	}
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
		if template, parseErr := presentation.ParseTemplateReference(document["template"]); parseErr == nil {
			input.Template = &template
		}
		input.Theme = documentTheme(existing.Data)
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
	initial := generationPlaceholder(input)
	placeholder, _ := json.Marshal(initial)
	job := streamJob{jobID: jobID, userID: userID, operationID: operationID, presentationID: presentationID, quote: quote, prompt: input.Topic, slideCount: input.SlideCount, detailLevel: input.DetailLevel, tonality: input.Tonality, research: input.Research, researchPayload: input.ResearchPayload, selection: selection, template: input.Template, theme: input.Theme, kind: "generation"}
	return job, placeholder, nil
}

func generationPlaceholder(input submitInput) map[string]any {
	retry := map[string]any{"prompt": input.Topic, "slide_count": input.SlideCount, "detail_level": input.DetailLevel, "tonality": input.Tonality, "research_enabled": input.Research != nil || input.ResearchPayload != nil, "research_payload": input.ResearchPayload, "ai": input.AI}
	theme := input.Theme
	if theme == "" {
		theme = "corporate-blue"
	}
	initial := map[string]any{"title": "Generating...", "theme": theme, "dimensions": map[string]int{"width": 1280, "height": 720}, "slides": []any{}, "status": "generating", "failure": map[string]any{"retry": retry}}
	if input.Template != nil {
		retry["template"] = input.Template
		initial["template"] = input.Template
	}
	return initial
}

func (h *handler) iterationJob(ctx context.Context, userID string, input submitInput, jobID string) (streamJob, error) {
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
	job := buildIterationJob(jobID, userID, operationID, base, input, count, quote, selection)
	return job, nil
}

func buildIterationJob(jobID, userID, operationID string, base persistedPresentation, input submitInput, count int, quote int64, selection *ai.Selection) streamJob {
	return streamJob{jobID: jobID, userID: userID, operationID: operationID, presentationID: base.ID, expectedRevision: base.Revision, quote: quote, prompt: input.Topic, slideCount: count, detailLevel: input.DetailLevel, tonality: input.Tonality, research: input.Research, selection: selection, template: templateFromDocument(base.Data), theme: documentTheme(base.Data), current: base.Data, kind: "iteration"}
}

type streamJob struct {
	jobID, userID, operationID, presentationID string
	expectedRevision                           int
	quote                                      int64
	prompt                                     string
	slideCount                                 int
	detailLevel, tonality, kind                string
	research                                   any
	researchPayload                            *presentation.ResearchPayload
	selection                                  *ai.Selection
	template                                   *presentation.TemplateReference
	theme                                      string
	credential                                 string
	current                                    json.RawMessage
	requestHash                                string
}

func templateFromDocument(data []byte) *presentation.TemplateReference {
	var document map[string]any
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.UseNumber()
	if decoder.Decode(&document) != nil {
		return nil
	}
	template, err := presentation.ParseTemplateReference(document["template"])
	if err != nil {
		return nil
	}
	return &template
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
