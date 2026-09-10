package presentation

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strings"
	"unicode/utf8"
)

var binaryTemplateIDPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var templateDigestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// Document renders the reference for storage. The digest is written only once
// the server has resolved it, so a document never carries a half-identified
// template.
func (reference TemplateReference) Document() map[string]any {
	stored := map[string]any{"id": reference.ID, "version": reference.Version}
	if reference.SHA256 != "" {
		stored["sha256"] = reference.SHA256
	}
	return stored
}

// ParseTemplateReference reads a template reference from request or document
// JSON. A digest present in the value is accepted only when it is well formed;
// callers must still resolve the authoritative digest from the published
// catalog rather than trusting one that arrived with a request.
func ParseTemplateReference(value any) (TemplateReference, error) {
	template, ok := value.(map[string]any)
	if !ok {
		return TemplateReference{}, fmt.Errorf("template must be an object")
	}
	id := boundedText(template["id"], 120)
	version, validVersion := exactInteger(template["version"])
	if !binaryTemplateIDPattern.MatchString(id) || !validVersion || version != 1 {
		return TemplateReference{}, fmt.Errorf("invalid PowerPoint template")
	}
	reference := TemplateReference{ID: id, Version: 1}
	if raw, present := template["sha256"]; present && raw != nil {
		digest := boundedText(raw, 64)
		if !templateDigestPattern.MatchString(digest) {
			return TemplateReference{}, fmt.Errorf("invalid PowerPoint template digest")
		}
		reference.SHA256 = digest
	}
	return reference, nil
}

func exactInteger(value any) (int64, bool) {
	switch number := value.(type) {
	case json.Number:
		parsed, err := number.Int64()
		return parsed, err == nil
	case int:
		return int64(number), true
	case int64:
		return number, true
	case float64:
		if math.Trunc(number) != number {
			return 0, false
		}
		return int64(number), true
	default:
		return 0, false
	}
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
