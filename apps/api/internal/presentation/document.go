package presentation

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

const PresentationSchemaVersion = 5

var validThemes = map[string]bool{
	"modern-dark":     true,
	"corporate-blue":  true,
	"minimalist":      true,
	"creative-studio": true,
	"elegant-serif":   true,
	"nature-green":    true,
}

var validLayouts = map[string]bool{
	"cover":       true,
	"section":     true,
	"body":        true,
	"split":       true,
	"comparison":  true,
	"sidebar":     true,
	"media-left":  true,
	"media-right": true,
	"quote":       true,
	"spotlight":   true,
	"canvas":      true,
}

func NormalizeDocument(value map[string]any) (map[string]any, error) {
	if value == nil {
		value = map[string]any{}
	}
	title := boundedText(value["title"], 240)
	if title == "" {
		title = "Untitled Presentation"
	}
	theme := boundedText(value["theme"], 100)
	if !validThemes[theme] {
		theme = "corporate-blue"
	}
	dimensions := normalizeDimensions(value["dimensions"])
	rawSlides, _ := value["slides"].([]any)
	slides := make([]any, 0, len(rawSlides))
	used := map[string]bool{}
	for index, raw := range rawSlides {
		slide, ok := normalizeSlide(raw, index, used)
		if ok {
			slides = append(slides, slide)
		}
	}
	result := make(map[string]any, len(value)+5)
	for key, item := range value {
		result[key] = item
	}
	allScenes := len(slides) > 0
	for _, value := range slides {
		slide, _ := value.(map[string]any)
		if slide["type"] != "scene" {
			allScenes = false
			break
		}
	}
	if allScenes {
		result["schemaVersion"] = 6
		if boundedText(result["engineVersion"], 40) == "" {
			result["engineVersion"] = "1.0.0"
		}
	} else {
		result["schemaVersion"] = PresentationSchemaVersion
		delete(result, "engineVersion")
	}
	result["title"] = title
	result["theme"] = theme
	result["dimensions"] = dimensions
	result["slides"] = slides
	result["totalSlides"] = len(slides)
	if _, ok := result["sources"].([]any); !ok {
		result["sources"] = []any{}
	}
	return result, nil
}

func NormalizeDocumentJSON(raw json.RawMessage) (json.RawMessage, error) {
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	normalized, err := NormalizeDocument(value)
	if err != nil {
		return nil, err
	}
	return json.Marshal(normalized)
}

func normalizeDimensions(value any) map[string]int {
	dimensions, _ := value.(map[string]any)
	return map[string]int{
		"width":  boundedInteger(dimensions["width"], 320, 4096, 1280),
		"height": boundedInteger(dimensions["height"], 240, 4096, 720),
	}
}

func normalizeSlide(value any, index int, used map[string]bool) (map[string]any, bool) {
	input, ok := value.(map[string]any)
	if !ok {
		return nil, false
	}
	id := boundedText(input["id"], 120)
	if id == "" || used[id] {
		id = fmt.Sprintf("slide-%d", index+1)
		for suffix := 2; used[id]; suffix++ {
			id = fmt.Sprintf("slide-%d-%d", index+1, suffix)
		}
	}
	used[id] = true
	if input["type"] == "scene" {
		root, rootOK := input["root"].(map[string]any)
		if !rootOK || root["type"] != "group" {
			return nil, false
		}
		result := make(map[string]any, len(input)+2)
		for key, item := range input {
			result[key] = item
		}
		result["id"], result["type"] = id, "scene"
		return result, true
	}
	if input["type"] == "chart" {
		if _, chartOK := input["chartConfig"].(map[string]any); chartOK {
			result := make(map[string]any, len(input)+2)
			for key, item := range input {
				result[key] = item
			}
			result["id"], result["type"] = id, "chart"
			return result, true
		}
	}
	title := boundedText(input["title"], 300)
	if title == "" {
		title = fmt.Sprintf("Slide %d", index+1)
	}
	layout := boundedText(input["layout"], 40)
	if !validLayouts[layout] {
		if index == 0 {
			layout = "cover"
		} else {
			layout = "body"
		}
	}
	blocks := normalizeBlocks(input, id)
	if len(blocks) == 0 {
		blocks = []any{map[string]any{
			"id":        id + "-block-1",
			"type":      "paragraph",
			"region":    "main",
			"text":      fallbackSlideContent(input),
			"emphasis":  "standard",
			"treatment": "plain",
			"sourceIds": []any{},
		}}
	}
	return map[string]any{
		"id":         id,
		"type":       "content",
		"layout":     layout,
		"title":      title,
		"subtitle":   boundedText(input["subtitle"], 500),
		"tone":       knownText(input["tone"], "default", "default", "muted", "accent", "inverse"),
		"density":    knownText(input["density"], "standard", "airy", "standard", "compact"),
		"pattern":    knownText(input["pattern"], "none", "none", "grid", "dots", "diagonal"),
		"blocks":     blocks,
		"transition": map[string]any{"type": "none", "durationMs": 0},
		"effects":    []any{},
	}, true
}

func normalizeBlocks(input map[string]any, slideID string) []any {
	raw, _ := input["blocks"].([]any)
	if len(raw) == 0 {
		if content, ok := input["content"].(map[string]any); ok {
			raw, _ = content["blocks"].([]any)
		} else {
			raw, _ = input["content"].([]any)
		}
	}
	result := make([]any, 0, len(raw))
	for index, value := range raw {
		block, ok := value.(map[string]any)
		if !ok {
			continue
		}
		region := knownText(block["region"], "main", "main", "primary", "secondary", "media")
		base := map[string]any{
			"id":        fmt.Sprintf("%s-block-%d", slideID, index+1),
			"region":    region,
			"emphasis":  knownText(block["emphasis"], "standard", "standard", "strong", "hero", "supporting"),
			"treatment": knownText(block["treatment"], "plain", "plain", "card", "outline", "accent"),
			"sourceIds": stringArray(block["sourceIds"], 12, 120),
		}
		switch block["type"] {
		case "paragraph", "text":
			if text := boundedText(firstValue(block, "text", "content"), 700); text != "" {
				base["type"], base["text"] = "paragraph", text
				result = append(result, base)
			}
		case "bullets":
			if items := stringArray(firstValue(block, "items", "bullets", "points", "content"), 6, 180); len(items) > 0 {
				base["type"], base["items"], base["ordered"] = "bullets", items, block["ordered"] == true
				result = append(result, base)
			}
		case "quote":
			if text := boundedText(firstValue(block, "text", "content"), 500); text != "" {
				base["type"], base["text"], base["attribution"] = "quote", text, boundedText(block["attribution"], 200)
				result = append(result, base)
			}
		case "callout":
			if text := boundedText(firstValue(block, "text", "content"), 400); text != "" {
				base["type"], base["heading"], base["text"] = "callout", boundedText(block["heading"], 180), text
				result = append(result, base)
			}
		case "image-placeholder":
			base["type"], base["alt"], base["caption"] = "image-placeholder", knownText(block["alt"], "Supporting visual"), boundedText(block["caption"], 300)
			result = append(result, base)
		}
	}
	return result
}

func firstValue(values map[string]any, keys ...string) any {
	for _, key := range keys {
		if value, ok := values[key]; ok {
			return value
		}
	}
	return nil
}

func fallbackSlideContent(input map[string]any) string {
	if content := boundedText(input["content"], 700); content != "" {
		return content
	}
	for _, key := range []string{"bullets", "keyPoints", "points"} {
		if values := stringArray(input[key], 6, 180); len(values) > 0 {
			return strings.Join(stringValues(values), " | ")
		}
	}
	return "Content to be developed."
}

func stringValues(values []any) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, value.(string))
	}
	return result
}

func stringArray(value any, maximumItems, maximumLength int) []any {
	values, _ := value.([]any)
	if len(values) > maximumItems {
		values = values[:maximumItems]
	}
	result := make([]any, 0, len(values))
	for _, item := range values {
		if text := boundedText(item, maximumLength); text != "" {
			result = append(result, text)
		}
	}
	return result
}

func boundedText(value any, maximum int) string {
	text, ok := value.(string)
	if !ok {
		return ""
	}
	text = strings.TrimSpace(text)
	if utf8.RuneCountInString(text) <= maximum {
		return text
	}
	runes := []rune(text)
	return string(runes[:maximum])
}

func knownText(value any, fallback string, allowed ...string) string {
	text := boundedText(value, 100)
	for _, candidate := range allowed {
		if text == candidate {
			return text
		}
	}
	return fallback
}

func boundedInteger(value any, minimum, maximum, fallback int) int {
	number, ok := value.(json.Number)
	if !ok {
		return fallback
	}
	parsed, err := number.Int64()
	if err != nil {
		return fallback
	}
	if parsed < int64(minimum) {
		return minimum
	}
	if parsed > int64(maximum) {
		return maximum
	}
	return int(parsed)
}
