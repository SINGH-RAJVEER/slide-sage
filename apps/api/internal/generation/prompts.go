package generation

import (
	"errors"
	"fmt"
	"strings"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
)

const (
	planningSystemPrompt = `Return exactly one JSON object and no Markdown. Create a DeckPlan with title, audience, thesis, style, and slides. style must be minimal, visual, classic, or consultant. Return exactly the requested number of slides. Each slide requires id, purpose, title, message, evidence, and visualIntent. purpose must be cover, section, context, problem, insight, solution, evidence, comparison, process, recommendation, or closing. visualIntent must be one of these data-only shapes:
- {"kind":"none"}
- {"kind":"image-hero","imagePrompt":"Specific visual direction","focalPoint":"center"}
- {"kind":"timeline","events":[{"label":"2024","title":"Milestone","description":"What changed"},{"label":"2025","title":"Next milestone","description":"What changes next"}]}
- {"kind":"process","nodes":[{"label":"Step","description":"What happens"},{"label":"Next step","description":"What happens next"}]}
- {"kind":"comparison","left":{"title":"Option A","items":["Point"]},"right":{"title":"Option B","items":["Point"]}}
- {"kind":"metric-grid","metrics":[{"value":"42%","label":"Metric"},{"value":"3x","label":"Metric"}]}
- {"kind":"chart","chartType":"bar","dataSeries":[{"label":"Series","values":[1,2]}]}
Use visual intents only when they clarify the slide message. Evidence must contain short source references from the supplied research, never invented citations. Never return HTML, Markdown, CSS, code, coordinates, colors, URLs, styles, or class names.`
	generationSystemPrompt = `Return exactly one JSON object and no Markdown. The object must contain title and slides. Every slide must use type "content" and contain id, layout, title, subtitle, tone, density, pattern, and a top-level blocks array. Every slide must contain at least one substantive text block. Use only these exact block shapes:
- {"type":"paragraph","region":"main","text":"Concise presentation copy"}
- {"type":"bullets","region":"main","items":["Specific point"],"ordered":false}
- {"type":"quote","region":"main","text":"Quote","attribution":"Source"}
- {"type":"callout","region":"main","heading":"Key point","text":"Supporting detail"}
- {"type":"image-placeholder","region":"media","alt":"Description of a useful visual","caption":"Optional caption","focalPoint":"center"}
Block region must be main, primary, secondary, or media. Do not rename text or items, do not nest blocks under content, and do not return empty blocks. Never return HTML, Markdown, CSS, code, styles, class names, coordinates, or arbitrary colors.`
)

func clientExportTemplateReady(reference *presentation.TemplateReference) bool {
	return reference != nil && reference.ID == "simple-business-proposal" && reference.Version == 1
}

func validateGenerationTemplate(reference *presentation.TemplateReference) error {
	if reference == nil {
		return errors.New("A PowerPoint template is required for generation")
	}
	if !clientExportTemplateReady(reference) {
		return errors.New("The selected PowerPoint template is not ready for generation")
	}
	return nil
}

func planningSystemPromptForTemplate(reference *presentation.TemplateReference) string {
	if !clientExportTemplateReady(reference) {
		return planningSystemPrompt
	}
	prompt := planningSystemPrompt
	for _, unsupported := range []string{
		`- {"kind":"image-hero","imagePrompt":"Specific visual direction","focalPoint":"center"}`,
		`- {"kind":"chart","chartType":"bar","dataSeries":[{"label":"Series","values":[1,2]}]}`,
	} {
		prompt = strings.Replace(prompt, unsupported+"\n", "", 1)
	}
	return prompt + "\nThe selected PowerPoint template cannot render images or charts. Do not request either visual kind."
}

func generationSystemPromptForTemplate(reference *presentation.TemplateReference) string {
	if !clientExportTemplateReady(reference) {
		return generationSystemPrompt
	}
	unsupported := `- {"type":"image-placeholder","region":"media","alt":"Description of a useful visual","caption":"Optional caption","focalPoint":"center"}`
	prompt := strings.Replace(generationSystemPrompt, unsupported+"\n", "", 1)
	return prompt + "\nThe selected PowerPoint template cannot render images. Return text blocks only."
}

func validatePlanForTemplate(plan map[string]any, reference *presentation.TemplateReference) error {
	if !clientExportTemplateReady(reference) {
		return validateGenerationTemplate(reference)
	}
	slides, _ := plan["slides"].([]any)
	for index, value := range slides {
		slide, _ := value.(map[string]any)
		intent, _ := slide["visualIntent"].(map[string]any)
		kind, _ := intent["kind"].(string)
		if kind == "chart" || kind == "image-hero" {
			return fmt.Errorf("slide %d requests unsupported %s content", index+1, kind)
		}
	}
	return nil
}

func validateDocumentForTemplate(document map[string]any, reference *presentation.TemplateReference) error {
	if !clientExportTemplateReady(reference) {
		return validateGenerationTemplate(reference)
	}
	slides, _ := document["slides"].([]any)
	for slideIndex, value := range slides {
		slide, _ := value.(map[string]any)
		if slide["backgroundImage"] != nil {
			return fmt.Errorf("slide %d contains an unsupported background image", slideIndex+1)
		}
		blocks, _ := slide["blocks"].([]any)
		for _, blockValue := range blocks {
			block, _ := blockValue.(map[string]any)
			kind, _ := block["type"].(string)
			switch kind {
			case "chart", "image", "image-placeholder", "stats", "table", "widget":
				return fmt.Errorf("slide %d contains unsupported %s content", slideIndex+1, kind)
			}
		}
	}
	return nil
}
