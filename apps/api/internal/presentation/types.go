// Package presentation contains persistence, request parsing, and web research
// primitives for presentation endpoints.
package presentation

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

const (
	MaxResearchPayloadBytes = 128 * 1024
)

type Presentation struct {
	ID                   string
	UserID               string
	Title                string
	Prompt               string
	SlidesData           json.RawMessage
	AIProvider           sql.NullString
	AIModel              sql.NullString
	ParentPresentationID sql.NullString
	Revision             int
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

type NewPresentation struct {
	ID                   string
	UserID               string
	Title                string
	Prompt               string
	SlidesData           json.RawMessage
	AIProvider           *string
	AIModel              *string
	ParentPresentationID *string
}

type PresentationPage struct {
	Presentations []Presentation
	Total         int
	HasMore       bool
}

type PresentationSummary struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Prompt      string    `json:"prompt"`
	SlideCount  int       `json:"slide_count"`
	Status      string    `json:"status"`
	HasResearch bool      `json:"has_research"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PresentationDetail struct {
	ID         string          `json:"id"`
	Title      string          `json:"title"`
	Prompt     string          `json:"prompt"`
	SlidesData json.RawMessage `json:"slides_data"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

type ResearchOptions struct {
	Enabled            bool     `json:"enabled"`
	Freshness          string   `json:"freshness,omitempty"`
	MaxResults         int      `json:"maxResults,omitempty"`
	IncludeDomains     []string `json:"includeDomains,omitempty"`
	ExcludeDomains     []string `json:"excludeDomains,omitempty"`
	StartPublishedDate string   `json:"startPublishedDate,omitempty"`
	EndPublishedDate   string   `json:"endPublishedDate,omitempty"`
	MaxAgeHours        *int     `json:"maxAgeHours,omitempty"`
}

type Source struct {
	URL           string   `json:"url"`
	Title         string   `json:"title,omitempty"`
	Snippet       string   `json:"snippet,omitempty"`
	RetrievedAt   string   `json:"retrieved_at,omitempty"`
	PublishedDate string   `json:"published_date,omitempty"`
	Author        string   `json:"author,omitempty"`
	Highlights    []string `json:"highlights,omitempty"`
	Summary       string   `json:"summary,omitempty"`
}

type ResearchPayload struct {
	Sources         []Source `json:"sources"`
	EstimatedTokens *float64 `json:"estimated_tokens,omitempty"`
}

type DBTX interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}
