package generation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/pptxcompiler"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentationrevision"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templateasset"
	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/templatemanifest"
)

const slotSystemPrompt = `Return one JSON object with title and slides. Every slide has position (one-based) and slots (values keyed by the exact manifest slot ID). Follow the supplied ordered assignments exactly. A text slot takes a string; a list slot takes an array of strings. maxCharacters applies per string and maxListItems limits array length. Required slots cannot be empty. Use null for optional images unless a supplied image asset provides verified base64 and mimeType; never invent image bytes or URLs. Omit optional slots only when the slide does not need them; omitted sample objects are cleared. No styling, coordinates, layouts, regions, CSS, or semantic slide blocks. Use research sources accurately and do not invent citations.`

func assignmentForJob(job streamJob) ([]pptxcompiler.Assignment, error) {
	if job.template == nil {
		return nil, fmt.Errorf("template is required")
	}
	m, err := templatemanifest.Lookup(job.template.ID, job.template.Version)
	if err != nil {
		return nil, err
	}
	if m.SHA256 != job.template.SHA256 {
		return nil, fmt.Errorf("template manifest digest mismatch")
	}
	a, err := pptxcompiler.Assign(m, job.slideCount)
	if err != nil {
		return nil, err
	}
	return a, pptxcompiler.ValidateAssignments(a)
}

func (h *handler) generateSlots(ctx context.Context, job streamJob, assignments []pptxcompiler.Assignment) (string, []pptxcompiler.SlideContent, int, error) {
	plan, _ := json.Marshal(assignments)
	user := generationUserPrompt(job) + "\nOrdered manifest assignments and limits: " + string(plan)
	document, tokens, err := h.generateJSON(ctx, job, slotSystemPrompt, user, maxOutputTokens(job.slideCount))
	if err != nil {
		return "", nil, tokens, err
	}
	raw, _ := json.Marshal(document["slides"])
	var received []pptxcompiler.SlideContent
	_ = json.Unmarshal(raw, &received)
	byPosition := map[int]pptxcompiler.SlideContent{}
	duplicates := map[int]bool{}
	for _, s := range received {
		if s.Position < 1 || s.Position > len(assignments) {
			return "", nil, tokens, fmt.Errorf("provider returned unexpected slide %d", s.Position)
		}
		if _, ok := byPosition[s.Position]; ok {
			duplicates[s.Position] = true
		}
		byPosition[s.Position] = s
	}
	result := make([]pptxcompiler.SlideContent, len(assignments))
	for i, a := range assignments {
		content := byPosition[a.Position]
		issue := pptxcompiler.ValidateSlide(a, content)
		if duplicates[a.Position] {
			issue = fmt.Errorf("duplicate position")
		}
		for attempt := 0; issue != nil && attempt < 2; attempt++ {
			assignment, _ := json.Marshal(a)
			previous, _ := json.Marshal(content)
			repair, used, e := h.generateJSON(ctx, job, slotSystemPrompt, user+"\nRepair only this slide: "+string(assignment)+"\nPrevious: "+string(previous)+"\nValidation error: "+issue.Error()+"\nReturn {\"position\":number,\"slots\":{...}}.", maxOutputTokens(1))
			tokens += used
			if e != nil {
				return "", nil, tokens, e
			}
			encoded, _ := json.Marshal(repair)
			content = pptxcompiler.SlideContent{}
			_ = json.Unmarshal(encoded, &content)
			issue = pptxcompiler.ValidateSlide(a, content)
		}
		if issue != nil {
			return "", nil, tokens, fmt.Errorf("slide %d: %w", i+1, issue)
		}
		result[i] = content
	}
	return truncate(text(document["title"], "Untitled Presentation"), 255), result, tokens, nil
}

func (h *handler) compileJob(ctx context.Context, job streamJob) (presentationrevision.Revision, map[string]any, int, error) {
	var output []byte
	var title string
	var tokens int
	var err error
	input := presentationrevision.CommitInput{PresentationID: job.presentationID, AuthorID: job.userID, Operation: presentationrevision.SourceOperation{ID: job.operationID, Kind: presentationrevision.SourceOperationGeneration}, ExpectedSlideCount: job.slideCount, MIMEType: presentationrevision.PPTXContentType, CompilerVersion: pptxcompiler.Version}
	if job.kind == "iteration" {
		number := presentationrevision.RevisionNumber(job.pptxRevision)
		r, found, e := h.revisions.FindRevision(ctx, job.presentationID, number)
		if e != nil {
			return r, nil, 0, e
		}
		if !found {
			return r, nil, 0, presentationrevision.ErrRevisionConflict
		}
		object, e := h.objects.OpenObject(ctx, r.ObjectKey)
		if e != nil {
			return r, nil, 0, e
		}
		source, e := io.ReadAll(io.LimitReader(object, presentationrevision.DefaultMaxPPTXBytes+1))
		object.Close()
		if e != nil {
			return r, nil, 0, e
		}
		output, title, tokens, err = h.revisePPTX(ctx, job, source)
		input.Operation.Kind = presentationrevision.SourceOperationAIRevision
		input.ExpectedRevision = number
		input.BaseRevision = &number
	} else {
		assignments, e := assignmentForJob(job)
		if e != nil {
			return presentationrevision.Revision{}, nil, 0, e
		}
		source, e := h.templates.Fetch(ctx, templateasset.Asset{ID: job.template.ID, Version: job.template.Version, SHA256: job.template.SHA256})
		if e != nil {
			return presentationrevision.Revision{}, nil, 0, e
		}
		var content []pptxcompiler.SlideContent
		title, content, tokens, err = h.generateSlots(ctx, job, assignments)
		if err == nil {
			output, err = pptxcompiler.Compile(source, assignments, content)
		}
		input.TemplateID, input.TemplateVersion, input.TemplateSHA256 = job.template.ID, job.template.Version, job.template.SHA256
	}
	if err != nil {
		return presentationrevision.Revision{}, nil, tokens, err
	}
	if job.quote > 0 && tokens <= 0 {
		return presentationrevision.Revision{}, nil, tokens, fmt.Errorf("provider usage unavailable")
	}
	input.PPTX = bytes.NewReader(output)
	revision, err := presentationrevision.NewService(h.revisions, h.objects, 0).Prepare(ctx, input)
	document := map[string]any{"title": title, "status": "ready", "documentKind": "pptx", "totalSlides": job.slideCount, "tokens_used": tokens}
	preserveJobTemplate(document, job)
	return revision, document, tokens, err
}

func (h *handler) configureDocuments(ctx context.Context) error {
	var err error
	h.templates, err = templateasset.NewCDNFetcherFromEnv()
	if err != nil {
		return err
	}
	h.objects, err = presentationrevision.NewGCSBlobStore(ctx, os.Getenv("PRESENTATION_GCS_BUCKET"))
	if err != nil {
		return err
	}
	h.revisions = presentationrevision.NewPostgresRepository(h.database)
	h.previewQueue, err = newInsertClient(h.database)
	return err
}

func (h *handler) revisePPTX(ctx context.Context, job streamJob, source []byte) ([]byte, string, int, error) {
	index, err := pptxcompiler.Index(source)
	if err != nil {
		return nil, "", 0, err
	}
	encoded, _ := json.Marshal(index)
	system := `Return one JSON object with title and operations. Each operation replaces text on the current revision: {"position":1,"shapeId":2,"expectedText":"exact indexed text","text":"replacement"}. Use only indexed text shapes, preserve all other objects and slide order. Do not return templates, slides, styling or geometry.`
	user := generationUserPrompt(job) + "\nUse a " + job.detailLevel + " level of detail and a " + job.tonality + " tone.\nCurrent revision index: " + string(encoded)
	var tokens int
	for attempt := 0; attempt < 2; attempt++ {
		response, used, e := h.generateJSON(ctx, job, system, user, maxOutputTokens(job.slideCount))
		tokens += used
		if e != nil {
			return nil, "", tokens, e
		}
		raw, _ := json.Marshal(response["operations"])
		var operations []pptxcompiler.TextOperation
		err = json.Unmarshal(raw, &operations)
		var output []byte
		if err == nil {
			output, err = pptxcompiler.ApplyTextOperations(source, operations)
		}
		if err == nil {
			return output, truncate(text(response["title"], "Untitled Presentation"), 255), tokens, nil
		}
		user += "\nRepair operations. Validation error: " + err.Error()
	}
	return nil, "", tokens, err
}
