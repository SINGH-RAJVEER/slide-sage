package presentation

import (
	"encoding/json"
	"errors"
	"strings"
)

type Mutation struct {
	Type       string
	Title      *string
	Theme      *string
	Template   map[string]any
	Dimensions map[string]any
	SlideID    string
	Slide      map[string]any
	SlideIDs   []string
}

func ParseMutations(body []byte) ([]Mutation, error) {
	if len(body) > 1024*1024 {
		return nil, inputError("Request body is too large", 413)
	}
	request, err := decodeObject(body)
	if err != nil {
		return nil, err
	}
	raw, ok := request["mutations"].([]any)
	if !ok || len(raw) == 0 {
		return nil, inputError("At least one presentation mutation is required", 400)
	}
	if len(raw) > 50 {
		return nil, inputError("A presentation update cannot contain more than 50 mutations", 400)
	}
	mutations := make([]Mutation, 0, len(raw))
	for _, value := range raw {
		input, ok := value.(map[string]any)
		kind, valid := input["type"].(string)
		if !ok || !valid {
			return nil, inputError("Invalid presentation mutation", 400)
		}
		mutation := Mutation{Type: kind}
		switch kind {
		case "update-presentation":
			if rawTitle, found := input["title"]; found {
				title, ok := rawTitle.(string)
				title = strings.TrimSpace(title)
				if !ok || len(title) == 0 {
					return nil, inputError("Invalid presentation title", 400)
				}
				title = boundedText(title, 240)
				mutation.Title = &title
			}
			if rawTheme, found := input["theme"]; found {
				theme, ok := rawTheme.(string)
				theme = strings.TrimSpace(theme)
				if !ok || !validThemes[theme] {
					return nil, inputError("Invalid presentation theme", 400)
				}
				mutation.Theme = &theme
			}
			if rawTemplate, found := input["template"]; found {
				template, valid := normalizeTemplateReference(rawTemplate)
				if !valid {
					return nil, inputError("Invalid PowerPoint template", 400)
				}
				mutation.Template = template
			}
			if rawDimensions, found := input["dimensions"]; found {
				dimensions, ok := rawDimensions.(map[string]any)
				if !ok {
					return nil, inputError("Invalid presentation dimensions", 400)
				}
				normalized := normalizeDimensions(dimensions)
				mutation.Dimensions = map[string]any{"width": normalized["width"], "height": normalized["height"]}
			}
		case "update-slide":
			mutation.SlideID, ok = input["slideId"].(string)
			mutation.Slide, valid = input["slide"].(map[string]any)
			if !ok || !valid || strings.TrimSpace(mutation.SlideID) == "" {
				return nil, inputError("Invalid slide update", 400)
			}
		case "delete-slide":
			mutation.SlideID, ok = input["slideId"].(string)
			if !ok || strings.TrimSpace(mutation.SlideID) == "" {
				return nil, inputError("Invalid slide deletion", 400)
			}
		case "reorder-slides":
			values, ok := input["slideIds"].([]any)
			if !ok {
				return nil, inputError("Invalid slide order", 400)
			}
			for _, value := range values {
				id, ok := value.(string)
				if !ok || strings.TrimSpace(id) == "" {
					return nil, inputError("Invalid slide order", 400)
				}
				mutation.SlideIDs = append(mutation.SlideIDs, id)
			}
		default:
			return nil, inputError("Unsupported presentation mutation", 400)
		}
		mutations = append(mutations, mutation)
	}
	return mutations, nil
}

func ApplyMutations(raw json.RawMessage, mutations []Mutation) (map[string]any, error) {
	var document map[string]any
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.UseNumber()
	if err := decoder.Decode(&document); err != nil || document == nil {
		return nil, errors.New("invalid stored presentation document")
	}
	title, _ := document["title"].(string)
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Untitled Presentation"
	}
	document["title"] = title
	slides, ok := document["slides"].([]any)
	if !ok {
		return nil, errors.New("invalid stored presentation slides")
	}
	for _, mutation := range mutations {
		switch mutation.Type {
		case "update-presentation":
			if mutation.Title != nil {
				document["title"] = *mutation.Title
			}
			if mutation.Theme != nil {
				document["theme"] = *mutation.Theme
			}
			if mutation.Template != nil {
				document["template"] = mutation.Template
			}
			if mutation.Dimensions != nil {
				document["dimensions"] = mutation.Dimensions
			}
		case "update-slide":
			index := slideIndex(slides, mutation.SlideID)
			if index < 0 {
				return nil, errors.New("slide not found")
			}
			id, _ := mutation.Slide["id"].(string)
			if id != mutation.SlideID {
				return nil, errors.New("slide IDs cannot be changed")
			}
			slides[index] = mutation.Slide
		case "delete-slide":
			if len(slides) <= 1 {
				return nil, errors.New("a presentation must contain at least one slide")
			}
			index := slideIndex(slides, mutation.SlideID)
			if index < 0 {
				return nil, errors.New("slide not found")
			}
			slides = append(slides[:index], slides[index+1:]...)
			document["slides"] = slides
		case "reorder-slides":
			if len(mutation.SlideIDs) != len(slides) {
				return nil, errors.New("slide order must contain every slide exactly once")
			}
			byID := make(map[string]any, len(slides))
			for _, slide := range slides {
				item, ok := slide.(map[string]any)
				id, valid := item["id"].(string)
				if !ok || !valid || id == "" {
					return nil, errors.New("invalid stored presentation slides")
				}
				if _, exists := byID[id]; exists {
					return nil, errors.New("slide order must contain every slide exactly once")
				}
				byID[id] = slide
			}
			reordered := make([]any, 0, len(slides))
			for _, id := range mutation.SlideIDs {
				slide, exists := byID[id]
				if !exists {
					return nil, errors.New("slide order must contain every slide exactly once")
				}
				reordered = append(reordered, slide)
				delete(byID, id)
			}
			if len(byID) != 0 {
				return nil, errors.New("slide order must contain every slide exactly once")
			}
			slides = reordered
			document["slides"] = slides
		}
	}
	document["totalSlides"] = len(slides)
	return document, nil
}

func slideIndex(slides []any, id string) int {
	for index, value := range slides {
		slide, ok := value.(map[string]any)
		if ok && slide["id"] == id {
			return index
		}
	}
	return -1
}
func documentJSON(document map[string]any) json.RawMessage {
	encoded, _ := json.Marshal(document)
	return encoded
}
