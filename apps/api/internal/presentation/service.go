package presentation

import (
	"context"
	"encoding/json"
	"errors"
)

type Service struct {
	repository *Repository
}

func NewService(repository *Repository) *Service {
	return &Service{repository: repository}
}

func (s *Service) List(ctx context.Context, userID string, limit, offset int) ([]PresentationSummary, int, bool, error) {
	page, err := s.repository.ListByUserID(ctx, userID, limit, offset)
	if err != nil {
		return nil, 0, false, err
	}
	summaries := make([]PresentationSummary, 0, len(page.Presentations))
	for _, presentation := range page.Presentations {
		summaries = append(summaries, presentationSummary(presentation))
	}
	return summaries, page.Total, page.HasMore, nil
}

func (s *Service) Detail(ctx context.Context, presentationID, userID string) (PresentationDetail, error) {
	presentation, err := s.repository.FindByID(ctx, presentationID)
	if err != nil {
		return PresentationDetail{}, err
	}
	if presentation.UserID != userID {
		return PresentationDetail{}, ErrUnauthorized
	}
	normalized, err := NormalizeDocumentJSON(presentation.SlidesData)
	if err != nil {
		return PresentationDetail{}, err
	}
	return PresentationDetail{ID: presentation.ID, Title: presentation.Title, Prompt: presentation.Prompt,
		SlidesData: normalized, CreatedAt: presentation.CreatedAt, UpdatedAt: presentation.UpdatedAt}, nil
}

func (s *Service) Delete(ctx context.Context, presentationID, userID string) error {
	if presentationID == "" || userID == "" {
		return errors.New("presentation ID and user ID are required")
	}
	return s.repository.DeleteOwned(ctx, presentationID, userID)
}

func (s *Service) Update(ctx context.Context, presentationID, userID string, mutations []Mutation) (PresentationDetail, error) {
	presentation, err := s.repository.FindByID(ctx, presentationID)
	if err != nil {
		return PresentationDetail{}, err
	}
	if presentation.UserID != userID {
		return PresentationDetail{}, ErrUnauthorized
	}
	normalized, err := NormalizeDocumentJSON(presentation.SlidesData)
	if err != nil {
		return PresentationDetail{}, err
	}
	document, err := ApplyMutations(normalized, mutations)
	if err != nil {
		return PresentationDetail{}, err
	}
	document, err = NormalizeDocument(document)
	if err != nil {
		return PresentationDetail{}, err
	}
	title, _ := document["title"].(string)
	updated, err := s.repository.UpdateOwnedAtRevision(ctx, presentationID, userID, presentation.Revision, title, documentJSON(document))
	if err != nil {
		return PresentationDetail{}, err
	}
	return PresentationDetail{ID: updated.ID, Title: updated.Title, Prompt: updated.Prompt,
		SlidesData: updated.SlidesData, CreatedAt: updated.CreatedAt, UpdatedAt: updated.UpdatedAt}, nil
}

func presentationSummary(presentation Presentation) PresentationSummary {
	var document struct {
		Slides  []json.RawMessage `json:"slides"`
		Status  string            `json:"status"`
		Sources []json.RawMessage `json:"sources"`
		Failure struct {
			Retry struct {
				ResearchPayload struct {
					Sources []json.RawMessage `json:"sources"`
				} `json:"research_payload"`
			} `json:"retry"`
		} `json:"failure"`
	}
	_ = json.Unmarshal(presentation.SlidesData, &document)
	status := document.Status
	if status != "failed" && status != "generating" {
		status = "ready"
	}
	hasResearch := len(document.Sources) > 0
	if status == "failed" {
		hasResearch = len(document.Failure.Retry.ResearchPayload.Sources) > 0
	}
	return PresentationSummary{ID: presentation.ID, Title: presentation.Title, Prompt: presentation.Prompt,
		SlideCount: len(document.Slides), Status: status, HasResearch: hasResearch,
		CreatedAt: presentation.CreatedAt, UpdatedAt: presentation.UpdatedAt}
}
