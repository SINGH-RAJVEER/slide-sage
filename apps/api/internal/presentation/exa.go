package presentation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	exaEndpoint         = "https://api.exa.ai/search"
	maxExaResponseBytes = 512 * 1024
	defaultExaTimeout   = 10 * time.Second
)

type ExaResearchService struct {
	APIKey  string
	Client  *http.Client
	Timeout time.Duration
}

func NewExaResearchService(apiKey string, client *http.Client) *ExaResearchService {
	if client == nil {
		client = http.DefaultClient
	}
	return &ExaResearchService{APIKey: strings.TrimSpace(apiKey), Client: client, Timeout: defaultExaTimeout}
}

func (s *ExaResearchService) Search(ctx context.Context, query string, options ResearchOptions) ([]Source, error) {
	if !options.Enabled || strings.TrimSpace(query) == "" || s.APIKey == "" {
		return []Source{}, nil
	}
	query = strings.TrimSpace(query)
	if len(query) > 400 {
		query = query[:400]
	}
	maxResults := options.MaxResults
	if maxResults == 0 {
		maxResults = 5
	}
	if maxResults < 1 {
		maxResults = 1
	}
	if maxResults > 8 {
		maxResults = 8
	}
	maxAge := resolvedMaxAge(options)
	startDate := options.StartPublishedDate
	if startDate == "" {
		startDate = startDateForFreshness(options.Freshness, time.Now().UTC())
	}
	payload := struct {
		Query              string   `json:"query"`
		Type               string   `json:"type"`
		NumResults         int      `json:"numResults"`
		IncludeDomains     []string `json:"includeDomains,omitempty"`
		ExcludeDomains     []string `json:"excludeDomains,omitempty"`
		StartPublishedDate string   `json:"startPublishedDate,omitempty"`
		EndPublishedDate   string   `json:"endPublishedDate,omitempty"`
		Contents           struct {
			Highlights struct {
				Query         string `json:"query"`
				MaxCharacters int    `json:"maxCharacters"`
			} `json:"highlights"`
			Summary struct {
				Query string `json:"query"`
			} `json:"summary"`
			MaxAgeHours *int `json:"maxAgeHours,omitempty"`
		} `json:"contents"`
	}{Query: query, Type: "auto", NumResults: maxResults, IncludeDomains: options.IncludeDomains, ExcludeDomains: options.ExcludeDomains, StartPublishedDate: startDate, EndPublishedDate: options.EndPublishedDate}
	payload.Contents.Highlights.Query = query
	payload.Contents.Highlights.MaxCharacters = 1200
	payload.Contents.Summary.Query = query
	payload.Contents.MaxAgeHours = maxAge
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode Exa request: %w", err)
	}
	timeout := s.Timeout
	if timeout <= 0 {
		timeout = defaultExaTimeout
	}
	requestContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestContext, http.MethodPost, exaEndpoint, bytes.NewReader(encoded))
	if err != nil {
		return nil, fmt.Errorf("build Exa request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("x-api-key", s.APIKey)
	response, err := s.Client.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return []Source{}, nil
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return []Source{}, nil
	}
	if response.ContentLength > maxExaResponseBytes {
		return nil, errors.New("Exa response is too large")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, maxExaResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read Exa response: %w", err)
	}
	if len(raw) > maxExaResponseBytes {
		return nil, errors.New("Exa response is too large")
	}
	var result struct {
		Results []struct {
			URL           string   `json:"url"`
			Title         string   `json:"title"`
			PublishedDate string   `json:"publishedDate"`
			Author        string   `json:"author"`
			Highlights    []string `json:"highlights"`
			Summary       string   `json:"summary"`
		} `json:"results"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return []Source{}, nil
	}
	retrievedAt := time.Now().UTC().Format(time.RFC3339Nano)
	sources := make([]Source, 0, min(len(result.Results), maxResults))
	for _, item := range result.Results {
		if len(sources) == maxResults {
			break
		}
		sourceURL := truncate(strings.TrimSpace(item.URL), 2048)
		if !isHTTPURL(sourceURL) {
			continue
		}
		highlights := make([]string, 0, min(len(item.Highlights), 8))
		for _, highlight := range item.Highlights {
			if value := truncate(strings.TrimSpace(highlight), 1200); value != "" {
				highlights = append(highlights, value)
				if len(highlights) == 8 {
					break
				}
			}
		}
		summary := truncate(strings.TrimSpace(item.Summary), 4000)
		snippet := summary
		if snippet == "" && len(highlights) > 0 {
			snippet = highlights[0]
		}
		sources = append(sources, Source{URL: sourceURL, Title: truncate(strings.TrimSpace(item.Title), 500), Snippet: truncate(snippet, 2000), RetrievedAt: retrievedAt, PublishedDate: truncate(item.PublishedDate, 64), Author: truncate(strings.TrimSpace(item.Author), 200), Highlights: highlights, Summary: summary})
	}
	return sources, nil
}

func resolvedMaxAge(options ResearchOptions) *int {
	if options.MaxAgeHours != nil {
		value := *options.MaxAgeHours
		return &value
	}
	values := map[string]int{"day": 24, "week": 168, "month": 720, "year": 8760}
	if value, ok := values[options.Freshness]; ok {
		return &value
	}
	return nil
}
func startDateForFreshness(freshness string, now time.Time) string {
	days := map[string]int{"day": 1, "week": 7, "month": 30, "year": 365}
	if daysBack, ok := days[freshness]; ok {
		return now.AddDate(0, 0, -daysBack).Format("2006-01-02")
	}
	return ""
}
func isHTTPURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.Host != "" && (parsed.Scheme == "http" || parsed.Scheme == "https")
}
func truncate(value string, maximum int) string {
	if len(value) > maximum {
		return value[:maximum]
	}
	return value
}
func min(left, right int) int {
	if left < right {
		return left
	}
	return right
}
