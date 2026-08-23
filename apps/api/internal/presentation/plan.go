package presentation

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
)

const DeckPlanVersion = 1

var validPlanPurposes = map[string]bool{
	"cover": true, "section": true, "context": true, "problem": true,
	"insight": true, "solution": true, "evidence": true, "comparison": true,
	"process": true, "recommendation": true, "closing": true,
}

var validPlanStyles = map[string]bool{
	"minimal": true, "visual": true, "classic": true, "consultant": true,
}

var validChartTypes = map[string]bool{
	"bar": true, "line": true, "pie": true, "doughnut": true,
	"radar": true, "polarArea": true,
}

// NormalizeDeckPlan accepts only the bounded semantic planning contract used as
// input to drafting. It deliberately removes any provider-supplied styling,
// coordinates, code, or URLs that are not evidence references.
func NormalizeDeckPlan(value any, slideCount int) (map[string]any, error) {
	input, ok := value.(map[string]any)
	if !ok {
		return nil, errors.New("deck plan must be an object")
	}
	rawSlides, ok := input["slides"].([]any)
	if !ok || len(rawSlides) != slideCount {
		return nil, fmt.Errorf("deck plan must contain exactly %d slides", slideCount)
	}
	title := boundedText(input["title"], 240)
	if title == "" {
		return nil, errors.New("deck plan title is required")
	}
	style := boundedText(input["style"], 40)
	if !validPlanStyles[style] {
		return nil, errors.New("deck plan style is invalid")
	}
	used := map[string]bool{}
	slides := make([]any, 0, len(rawSlides))
	for index, rawSlide := range rawSlides {
		slide, err := normalizeDeckPlanSlide(rawSlide, index, used)
		if err != nil {
			return nil, fmt.Errorf("deck plan slide %d: %w", index+1, err)
		}
		slides = append(slides, slide)
	}
	return map[string]any{
		"version":  DeckPlanVersion,
		"title":    title,
		"audience": boundedText(input["audience"], 240),
		"thesis":   boundedText(input["thesis"], 500),
		"style":    style,
		"slides":   slides,
	}, nil
}

func normalizeDeckPlanSlide(value any, index int, used map[string]bool) (map[string]any, error) {
	input, ok := value.(map[string]any)
	if !ok {
		return nil, errors.New("must be an object")
	}
	id := boundedText(input["id"], 120)
	if id == "" || used[id] {
		id = fmt.Sprintf("slide-%d", index+1)
	}
	if used[id] {
		return nil, errors.New("has a duplicate id")
	}
	used[id] = true
	purpose := boundedText(input["purpose"], 40)
	if !validPlanPurposes[purpose] {
		return nil, errors.New("has an invalid purpose")
	}
	title := boundedText(input["title"], 300)
	message := boundedText(input["message"], 700)
	if title == "" || message == "" {
		return nil, errors.New("requires title and message")
	}
	intent, err := normalizeVisualIntent(input["visualIntent"])
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"id":           id,
		"purpose":      purpose,
		"title":        title,
		"message":      message,
		"evidence":     stringArray(input["evidence"], 8, 500),
		"visualIntent": intent,
		"layout":       layoutForPlan(purpose, intent),
	}, nil
}

func normalizeVisualIntent(value any) (map[string]any, error) {
	input, ok := value.(map[string]any)
	if !ok {
		return nil, errors.New("requires a visualIntent object")
	}
	kind := boundedText(input["kind"], 40)
	switch kind {
	case "none":
		return map[string]any{"kind": kind}, nil
	case "image-hero":
		prompt := boundedText(input["imagePrompt"], 700)
		if prompt == "" {
			return nil, errors.New("image-hero requires imagePrompt")
		}
		return map[string]any{
			"kind":        kind,
			"imagePrompt": prompt,
			"focalPoint":  knownText(input["focalPoint"], "center", "center", "top", "bottom", "left", "right"),
		}, nil
	case "timeline":
		events, err := normalizePlanRecords(input["events"], 2, 12, []string{"label", "title", "description"}, []int{80, 180, 400})
		if err != nil {
			return nil, fmt.Errorf("timeline %w", err)
		}
		return map[string]any{"kind": kind, "events": events}, nil
	case "process":
		nodes, err := normalizePlanRecords(input["nodes"], 2, 12, []string{"label", "description"}, []int{180, 400})
		if err != nil {
			return nil, fmt.Errorf("process %w", err)
		}
		return map[string]any{"kind": kind, "nodes": nodes}, nil
	case "comparison":
		left, err := normalizeComparisonColumn(input["left"])
		if err != nil {
			return nil, fmt.Errorf("comparison left %w", err)
		}
		right, err := normalizeComparisonColumn(input["right"])
		if err != nil {
			return nil, fmt.Errorf("comparison right %w", err)
		}
		return map[string]any{"kind": kind, "left": left, "right": right}, nil
	case "metric-grid":
		metrics, err := normalizePlanRecords(input["metrics"], 2, 8, []string{"value", "label"}, []int{80, 180})
		if err != nil {
			return nil, fmt.Errorf("metric-grid %w", err)
		}
		return map[string]any{"kind": kind, "metrics": metrics}, nil
	case "chart":
		chartType := boundedText(input["chartType"], 40)
		if !validChartTypes[chartType] {
			return nil, errors.New("chart has an invalid chartType")
		}
		series, err := normalizeChartSeries(input["dataSeries"])
		if err != nil {
			return nil, err
		}
		return map[string]any{"kind": kind, "chartType": chartType, "dataSeries": series}, nil
	default:
		return nil, errors.New("has an unsupported visualIntent kind")
	}
}

func normalizePlanRecords(value any, minimum, maximum int, keys []string, lengths []int) ([]any, error) {
	values, ok := value.([]any)
	if !ok || len(values) < minimum || len(values) > maximum {
		return nil, fmt.Errorf("requires %d-%d items", minimum, maximum)
	}
	result := make([]any, 0, len(values))
	for _, value := range values {
		input, ok := value.(map[string]any)
		if !ok {
			return nil, errors.New("contains a non-object item")
		}
		item := map[string]any{}
		for index, key := range keys {
			text := boundedText(input[key], lengths[index])
			if text == "" {
				return nil, fmt.Errorf("requires %s", key)
			}
			item[key] = text
		}
		result = append(result, item)
	}
	return result, nil
}

func normalizeComparisonColumn(value any) (map[string]any, error) {
	input, ok := value.(map[string]any)
	if !ok {
		return nil, errors.New("must be an object")
	}
	title := boundedText(input["title"], 180)
	items := stringArray(input["items"], 6, 180)
	if title == "" || len(items) == 0 {
		return nil, errors.New("requires title and items")
	}
	return map[string]any{"title": title, "items": items}, nil
}

func normalizeChartSeries(value any) ([]any, error) {
	values, ok := value.([]any)
	if !ok || len(values) == 0 || len(values) > 8 {
		return nil, errors.New("chart requires 1-8 dataSeries")
	}
	result := make([]any, 0, len(values))
	for _, value := range values {
		input, ok := value.(map[string]any)
		if !ok {
			return nil, errors.New("chart dataSeries contains a non-object item")
		}
		label := boundedText(input["label"], 180)
		numbers, ok := input["values"].([]any)
		if label == "" || !ok || len(numbers) == 0 || len(numbers) > 16 {
			return nil, errors.New("chart dataSeries requires label and 1-16 values")
		}
		values := make([]any, 0, len(numbers))
		for _, number := range numbers {
			parsed, err := numberValue(number)
			if err != nil {
				return nil, errors.New("chart values must be finite numbers")
			}
			values = append(values, parsed)
		}
		result = append(result, map[string]any{"label": label, "values": values})
	}
	return result, nil
}

func numberValue(value any) (float64, error) {
	switch number := value.(type) {
	case json.Number:
		parsed, err := number.Float64()
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			return 0, errors.New("invalid number")
		}
		return parsed, nil
	case float64:
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return 0, errors.New("invalid number")
		}
		return number, nil
	default:
		return 0, errors.New("invalid number")
	}
}

// ApplyDeckPlan is the deterministic plan-to-slide compiler for content
// content slides. Drafting supplies copy only; title, stable IDs, and semantic
// layouts always originate from the validated plan.
func ApplyDeckPlan(document map[string]any, plan map[string]any) map[string]any {
	document["deckPlan"] = plan
	document["title"] = plan["title"]
	slides, _ := document["slides"].([]any)
	planSlides, _ := plan["slides"].([]any)
	for index, rawSlide := range slides {
		if index >= len(planSlides) {
			break
		}
		slide, slideOK := rawSlide.(map[string]any)
		planSlide, planOK := planSlides[index].(map[string]any)
		if !slideOK || !planOK {
			continue
		}
		slide["id"] = planSlide["id"]
		slide["title"] = planSlide["title"]
		slide["layout"] = planSlide["layout"]
		intent, _ := planSlide["visualIntent"].(map[string]any)
		if intent["kind"] == "image-hero" {
			applyImageHeroIntent(slide, planSlide, intent)
		}
	}
	return document
}

func applyImageHeroIntent(slide, planSlide, intent map[string]any) {
	blocks, _ := slide["blocks"].([]any)
	for _, value := range blocks {
		block, ok := value.(map[string]any)
		if !ok || block["type"] != "image" && block["type"] != "image-placeholder" {
			continue
		}
		block["region"] = "media"
		if boundedText(block["alt"], 700) == "" {
			block["alt"] = intent["imagePrompt"]
		}
		block["focalPoint"] = intent["focalPoint"]
		return
	}
	blocks = append(blocks, map[string]any{
		"id":         boundedText(planSlide["id"], 120) + "-background",
		"type":       "image-placeholder",
		"region":     "media",
		"alt":        intent["imagePrompt"],
		"caption":    "",
		"focalPoint": intent["focalPoint"],
		"sourceIds":  planSlide["evidence"],
		"emphasis":   "supporting",
		"treatment":  "plain",
	})
	slide["blocks"] = blocks
}

func layoutForPlan(purpose string, intent map[string]any) string {
	if purpose == "cover" {
		return "cover"
	}
	if purpose == "section" {
		return "section"
	}
	switch intent["kind"] {
	case "comparison":
		return "comparison"
	case "image-hero":
		return "media-right"
	case "timeline", "process":
		return "canvas"
	case "metric-grid", "chart":
		return "spotlight"
	}
	switch purpose {
	case "comparison":
		return "comparison"
	case "process":
		return "canvas"
	case "context", "evidence", "recommendation":
		return "sidebar"
	case "problem", "solution":
		return "split"
	case "insight":
		return "spotlight"
	case "closing":
		return "spotlight"
	default:
		return "body"
	}
}
