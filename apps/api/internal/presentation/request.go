package presentation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type InputError struct {
	Message string
	Status  int
}

func (e *InputError) Error() string { return e.Message }

func ParseResearchOptions(input any) (ResearchOptions, error) {
	object, ok := input.(map[string]any)
	if !ok {
		return ResearchOptions{}, inputError("research must be an object", 400)
	}
	enabled, ok := object["enabled"].(bool)
	if !ok {
		return ResearchOptions{}, inputError("research.enabled must be a boolean", 400)
	}
	if !enabled {
		return ResearchOptions{Enabled: false}, nil
	}
	freshness, err := knownValue(object["freshness"], "research freshness", "", "day", "week", "month", "year")
	if err != nil {
		return ResearchOptions{}, err
	}
	maxResults, err := optionalInteger(object["maxResults"], "research.maxResults", 1, 8)
	if err != nil {
		return ResearchOptions{}, err
	}
	include, err := stringList(object["includeDomains"], "research.includeDomains", 10, 253)
	if err != nil {
		return ResearchOptions{}, err
	}
	exclude, err := stringList(object["excludeDomains"], "research.excludeDomains", 10, 253)
	if err != nil {
		return ResearchOptions{}, err
	}
	start, err := dateValue(object["startPublishedDate"], "research.startPublishedDate")
	if err != nil {
		return ResearchOptions{}, err
	}
	end, err := dateValue(object["endPublishedDate"], "research.endPublishedDate")
	if err != nil {
		return ResearchOptions{}, err
	}
	if start != "" && end != "" && start > end {
		return ResearchOptions{}, inputError("research.startPublishedDate cannot be after research.endPublishedDate", 400)
	}
	age, err := optionalInteger(object["maxAgeHours"], "research.maxAgeHours", 0, 8760)
	if err != nil {
		return ResearchOptions{}, err
	}
	result := ResearchOptions{Enabled: true, Freshness: freshness, IncludeDomains: include, ExcludeDomains: exclude, StartPublishedDate: start, EndPublishedDate: end, MaxAgeHours: age}
	if maxResults != nil {
		result.MaxResults = *maxResults
	}
	return result, nil
}

func ParseResearchPayload(input any) (ResearchPayload, error) {
	encoded, err := json.Marshal(input)
	if err != nil || len(encoded) > MaxResearchPayloadBytes {
		return ResearchPayload{}, inputError("research_payload is too large", 400)
	}
	object, ok := input.(map[string]any)
	if !ok {
		return ResearchPayload{}, inputError("research_payload must be an object", 400)
	}
	rawSources, ok := object["sources"].([]any)
	if !ok || len(rawSources) > 8 {
		return ResearchPayload{}, inputError("research_payload.sources must contain at most 8 sources", 400)
	}
	payload := ResearchPayload{Sources: make([]Source, 0, len(rawSources))}
	for index, raw := range rawSources {
		source, ok := raw.(map[string]any)
		if !ok {
			return ResearchPayload{}, inputError(fmt.Sprintf("research_payload.sources[%d] must be an object", index), 400)
		}
		urlValue, ok := source["url"].(string)
		urlValue = strings.TrimSpace(urlValue)
		parsed, parseErr := url.Parse(urlValue)
		if !ok || len(urlValue) == 0 || len(urlValue) > 2048 || parseErr != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			return ResearchPayload{}, inputError(fmt.Sprintf("research_payload.sources[%d].url must be an HTTP(S) URL", index), 400)
		}
		readText := func(key string, maximum int) (string, error) {
			return optionalText(source[key], fmt.Sprintf("research_payload.sources[%d].%s", index, key), maximum)
		}
		title, err := readText("title", 500)
		if err != nil {
			return ResearchPayload{}, err
		}
		snippet, err := readText("snippet", 2000)
		if err != nil {
			return ResearchPayload{}, err
		}
		retrieved, err := readText("retrieved_at", 64)
		if err != nil {
			return ResearchPayload{}, err
		}
		published := source["published_date"]
		if published == nil {
			published = source["publishedDate"]
		}
		publishedText, err := optionalText(published, fmt.Sprintf("research_payload.sources[%d].published_date", index), 64)
		if err != nil {
			return ResearchPayload{}, err
		}
		author, err := readText("author", 200)
		if err != nil {
			return ResearchPayload{}, err
		}
		highlights, err := stringList(source["highlights"], fmt.Sprintf("research_payload.sources[%d].highlights", index), 8, 1200)
		if err != nil {
			return ResearchPayload{}, err
		}
		summary, err := readText("summary", 4000)
		if err != nil {
			return ResearchPayload{}, err
		}
		payload.Sources = append(payload.Sources, Source{URL: urlValue, Title: title, Snippet: snippet, RetrievedAt: retrieved, PublishedDate: publishedText, Author: author, Highlights: highlights, Summary: summary})
	}
	if raw, exists := object["estimated_tokens"]; exists {
		value, ok := raw.(json.Number)
		if !ok {
			return ResearchPayload{}, inputError("research_payload.estimated_tokens is invalid", 400)
		}
		number, err := value.Float64()
		if err != nil || math.IsNaN(number) || math.IsInf(number, 0) || number < 0 || number > 1000000 {
			return ResearchPayload{}, inputError("research_payload.estimated_tokens is invalid", 400)
		}
		payload.EstimatedTokens = &number
	}
	return payload, nil
}

func decodeObject(body []byte) (map[string]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var result map[string]any
	if err := decoder.Decode(&result); err != nil || result == nil {
		return nil, inputError("Invalid JSON body", 400)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return nil, inputError("Invalid JSON body", 400)
	}
	return result, nil
}
func inputError(message string, status int) error {
	return &InputError{Message: message, Status: status}
}
func optionalText(value any, field string, maximum int) (string, error) {
	if value == nil {
		return "", nil
	}
	text, ok := value.(string)
	if !ok {
		return "", inputError(field+" must be a string", 400)
	}
	text = strings.TrimSpace(text)
	if len(text) > maximum {
		return "", inputError(field+" is too long", 400)
	}
	return text, nil
}
func optionalInteger(value any, field string, minimum, maximum int) (*int, error) {
	if value == nil {
		return nil, nil
	}
	number, ok := value.(json.Number)
	if !ok {
		return nil, inputError(field+" must be an integer", 400)
	}
	parsed, err := number.Int64()
	if err != nil || parsed < int64(minimum) || parsed > int64(maximum) {
		return nil, inputError(fmt.Sprintf("%s must be an integer between %d and %d", field, minimum, maximum), 400)
	}
	result := int(parsed)
	return &result, nil
}
func knownValue(value any, field, fallback string, allowed ...string) (string, error) {
	if value == nil {
		return fallback, nil
	}
	text, ok := value.(string)
	if !ok {
		return "", inputError("Invalid "+field, 400)
	}
	for _, candidate := range allowed {
		if text == candidate {
			return text, nil
		}
	}
	return "", inputError("Invalid "+field, 400)
}
func stringList(value any, field string, maximumItems, maximumLength int) ([]string, error) {
	if value == nil {
		return nil, nil
	}
	values, ok := value.([]any)
	if !ok || len(values) > maximumItems {
		return nil, inputError(fmt.Sprintf("%s must contain at most %d items", field, maximumItems), 400)
	}
	result := make([]string, 0, len(values))
	for _, raw := range values {
		text, ok := raw.(string)
		text = strings.TrimSpace(text)
		if !ok || len(text) < 1 || len(text) > maximumLength {
			return nil, inputError(fmt.Sprintf("%s entries must contain between 1 and %d characters", field, maximumLength), 400)
		}
		result = append(result, text)
	}
	if len(result) == 0 {
		return nil, nil
	}
	return result, nil
}

var datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func dateValue(value any, field string) (string, error) {
	if value == nil {
		return "", nil
	}
	text, ok := value.(string)
	if !ok || !datePattern.MatchString(text) {
		return "", inputError(field+" must use YYYY-MM-DD format", 400)
	}
	parsed, err := time.Parse("2006-01-02", text)
	if err != nil || parsed.Format("2006-01-02") != text {
		return "", inputError(field+" must be a valid date", 400)
	}
	return text, nil
}
