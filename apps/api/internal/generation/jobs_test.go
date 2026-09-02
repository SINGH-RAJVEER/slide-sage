package generation

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"testing"

	"github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/presentation"
)

func TestEventCursorPrefersLastEventID(t *testing.T) {
	request := &http.Request{Header: http.Header{"Last-Event-Id": []string{"42"}}, URL: &url.URL{RawQuery: "after=11"}}
	if cursor := eventCursor(request); cursor != 42 {
		t.Fatalf("expected cursor 42, got %d", cursor)
	}
}

func TestFinalDocumentPreservesJobTemplate(t *testing.T) {
	document := map[string]any{"theme": "provider-theme", "template": map[string]any{"id": "unknown"}}
	job := streamJob{template: &presentation.TemplateReference{ID: "soft-skills-training", Version: 1}}

	preserveJobTemplate(document, job)

	encoded, _ := json.Marshal(document["template"])
	if string(encoded) != `{"id":"soft-skills-training","version":1}` {
		t.Fatalf("template = %s", encoded)
	}
	if document["theme"] != "corporate-blue" {
		t.Fatalf("theme = %#v", document["theme"])
	}
}

func TestIterationJobRetainsExistingTemplate(t *testing.T) {
	base := persistedPresentation{Data: json.RawMessage(`{"theme":"terra-mesa","template":{"id":"soft-skills-training","version":1}}`)}
	job := buildIterationJob("job", "user", "operation", base, submitInput{}, 5, 0, nil)
	if job.template == nil || job.template.ID != "soft-skills-training" {
		t.Fatalf("template = %#v", job.template)
	}
}

func TestEventCursorRejectsNegativeValues(t *testing.T) {
	request := &http.Request{Header: http.Header{}, URL: &url.URL{RawQuery: "after=-5"}}
	if cursor := eventCursor(request); cursor != 0 {
		t.Fatalf("expected cursor 0, got %d", cursor)
	}
}

func TestRetryableProviderError(t *testing.T) {
	tests := []struct {
		name      string
		err       error
		retryable bool
	}{
		{name: "rate limited", err: &providerRequestError{Status: http.StatusTooManyRequests}, retryable: true},
		{name: "provider unavailable", err: &providerRequestError{Status: http.StatusServiceUnavailable}, retryable: true},
		{name: "invalid request", err: &providerRequestError{Status: http.StatusBadRequest}, retryable: false},
		{name: "network failure", err: &net.DNSError{Err: "temporary"}, retryable: true},
		{name: "validation failure", err: errors.New("invalid presentation"), retryable: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if actual := retryableProviderError(test.err); actual != test.retryable {
				t.Fatalf("expected retryable=%t, got %t", test.retryable, actual)
			}
		})
	}
}

func TestGenerationJobQueueOptions(t *testing.T) {
	args := JobArgs{JobID: "job_1"}
	if args.Kind() != "presentation_generation_v1" {
		t.Fatalf("unexpected job kind %q", args.Kind())
	}
	options := args.InsertOpts()
	if options.Queue != generationQueue || options.MaxAttempts != 3 {
		t.Fatalf("unexpected queue options: %#v", options)
	}
}

func TestGenerationJobRoutePatternsDoNotConflict(t *testing.T) {
	mux := http.NewServeMux()
	handler := func(http.ResponseWriter, *http.Request) {}
	mux.HandleFunc("POST /presentation-jobs", handler)
	mux.HandleFunc("GET /generation-jobs/{id}", handler)
	mux.HandleFunc("GET /generation-jobs/{id}/events", handler)
	mux.HandleFunc("POST /generation-jobs/{id}/cancel", handler)
}
