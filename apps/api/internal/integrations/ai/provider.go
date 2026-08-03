package ai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode"
)

const (
	maxResponseBytes int64 = 1 << 20
	maxPages               = 20
	maxModels              = 2000
)

type ModelDescriptor struct {
	Provider    Provider `json:"provider"`
	Model       string   `json:"model"`
	Label       string   `json:"label"`
	Description string   `json:"description"`
	Recommended bool     `json:"recommended,omitempty"`
}
type ValidationError struct {
	Message                string
	Rejected, Incompatible bool
}

func (e *ValidationError) Error() string { return e.Message }

func ValidateProviderKey(ctx context.Context, provider Provider, apiKey string, client *http.Client) ([]ModelDescriptor, error) {
	if provider != OpenAI && provider != Google && provider != Anthropic {
		return nil, errors.New("unsupported AI provider")
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	var models []ModelDescriptor
	var err error
	switch provider {
	case OpenAI:
		models, err = openAIModels(ctx, apiKey, client)
	case Google:
		models, err = googleModels(ctx, apiKey, client)
	default:
		models, err = anthropicModels(ctx, apiKey, client)
	}
	if err != nil {
		return nil, err
	}
	models = uniqueModels(models)
	if len(models) == 0 {
		return nil, &ValidationError{Message: "This account has no compatible text-generation models.", Incompatible: true}
	}
	return models, nil
}

func requestJSON(ctx context.Context, client *http.Client, endpoint string, headers map[string]string, output any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	res, err := client.Do(req)
	if err != nil {
		return &ValidationError{Message: "The provider could not be reached. Try again shortly."}
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return &ValidationError{Message: "The provider rejected this API key.", Rejected: true}
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return &ValidationError{Message: "The provider could not validate this API key."}
	}
	if res.ContentLength > maxResponseBytes {
		return &ValidationError{Message: "The provider returned an invalid model catalog."}
	}
	decoder := json.NewDecoder(io.LimitReader(res.Body, maxResponseBytes+1))
	if err := decoder.Decode(output); err != nil {
		return &ValidationError{Message: "The provider returned an invalid model catalog."}
	}
	return nil
}

func openAIModels(ctx context.Context, key string, client *http.Client) ([]ModelDescriptor, error) {
	var result struct {
		Data []struct {
			ID      string `json:"id"`
			Created int64  `json:"created"`
		} `json:"data"`
	}
	if err := requestJSON(ctx, client, "https://api.openai.com/v1/models", map[string]string{"Authorization": "Bearer " + key}, &result); err != nil {
		return nil, err
	}
	sort.Slice(result.Data, func(i, j int) bool { return result.Data[i].Created > result.Data[j].Created })
	models := make([]ModelDescriptor, 0)
	for _, entry := range result.Data {
		if id := normalizeModelID(entry.ID); id != "" && isOpenAITextModel(id) {
			models = append(models, descriptor(OpenAI, id, id, "OpenAI text-generation model"))
		}
	}
	return models, nil
}

func googleModels(ctx context.Context, key string, client *http.Client) ([]ModelDescriptor, error) {
	models := []ModelDescriptor{}
	token := ""
	for page := 0; page < maxPages; page++ {
		endpoint := "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000"
		if token != "" {
			endpoint += "&pageToken=" + url.QueryEscape(token)
		}
		var result struct {
			Models []struct {
				Name        string   `json:"name"`
				BaseModelID string   `json:"baseModelId"`
				DisplayName string   `json:"displayName"`
				Description string   `json:"description"`
				Supported   []string `json:"supportedGenerationMethods"`
			} `json:"models"`
			Next string `json:"nextPageToken"`
		}
		if err := requestJSON(ctx, client, endpoint, map[string]string{"x-goog-api-key": key}, &result); err != nil {
			return nil, err
		}
		for _, entry := range result.Models {
			if contains(entry.Supported, "generateContent") {
				id := normalizeModelID(entry.BaseModelID)
				if id == "" {
					id = normalizeModelID(entry.Name)
				}
				if id != "" {
					models = append(models, descriptor(Google, id, entry.DisplayName, entry.Description))
				}
			}
		}
		if len(models) >= maxModels || result.Next == "" {
			break
		}
		token = result.Next
	}
	return models, nil
}

func anthropicModels(ctx context.Context, key string, client *http.Client) ([]ModelDescriptor, error) {
	models := []ModelDescriptor{}
	after := ""
	for page := 0; page < maxPages; page++ {
		endpoint := "https://api.anthropic.com/v1/models?limit=1000"
		if after != "" {
			endpoint += "&after_id=" + url.QueryEscape(after)
		}
		var result struct {
			Data []struct {
				ID           string `json:"id"`
				DisplayName  string `json:"display_name"`
				Capabilities struct {
					Structured struct {
						Supported bool `json:"supported"`
					} `json:"structured_outputs"`
				} `json:"capabilities"`
			} `json:"data"`
			HasMore bool   `json:"has_more"`
			LastID  string `json:"last_id"`
		}
		if err := requestJSON(ctx, client, endpoint, map[string]string{"x-api-key": key, "anthropic-version": "2023-06-01"}, &result); err != nil {
			return nil, err
		}
		for _, entry := range result.Data {
			if id := normalizeModelID(entry.ID); id != "" && entry.Capabilities.Structured.Supported {
				models = append(models, descriptor(Anthropic, id, entry.DisplayName, "Anthropic model with structured output support"))
			}
		}
		if len(models) >= maxModels || !result.HasMore || result.LastID == "" {
			break
		}
		after = result.LastID
	}
	return models, nil
}

func normalizeModelID(value string) string {
	value = strings.TrimPrefix(strings.TrimSpace(value), "models/")
	if value == "" || len(value) > 160 {
		return ""
	}
	for _, r := range value {
		if unicode.IsControl(r) {
			return ""
		}
	}
	return value
}
func isOpenAITextModel(id string) bool {
	base := strings.TrimPrefix(id, "ft:")
	if i := strings.IndexByte(base, ':'); i >= 0 {
		base = base[:i]
	}
	allowed := strings.HasPrefix(strings.ToLower(base), "gpt-4o") || strings.HasPrefix(strings.ToLower(base), "gpt-4.1") || (strings.HasPrefix(strings.ToLower(base), "gpt-") && len(base) > 4 && base[4] >= '5' && base[4] <= '9') || (len(base) > 1 && (base[0] == 'o' || base[0] == 'O') && base[1] >= '1' && base[1] <= '9')
	return allowed && !strings.Contains(strings.ToLower(id), "audio") && !strings.Contains(strings.ToLower(id), "embedding") && !strings.Contains(strings.ToLower(id), "moderation") && !strings.Contains(strings.ToLower(id), "image")
}
func descriptor(provider Provider, model, label, description string) ModelDescriptor {
	if strings.TrimSpace(label) == "" {
		label = model
	}
	if strings.TrimSpace(description) == "" {
		description = string(provider) + " model"
	}
	return ModelDescriptor{provider, model, truncate(label, 160), truncate(description, 500), false}
}
func uniqueModels(models []ModelDescriptor) []ModelDescriptor {
	seen := map[string]bool{}
	output := []ModelDescriptor{}
	for _, model := range models {
		key := string(model.Provider) + "\x00" + model.Model
		if !seen[key] {
			seen[key] = true
			output = append(output, model)
		}
	}
	if len(output) > 0 {
		output[0].Recommended = true
	}
	return output
}
func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}
func truncate(value string, maximum int) string {
	if len(value) > maximum {
		return value[:maximum]
	}
	return value
}
