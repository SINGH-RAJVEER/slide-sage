package generation

import (
	"errors"
	"net"
	"net/http"
	"net/url"
	"testing"
)

func TestEventCursorPrefersLastEventID(t *testing.T) {
	request := &http.Request{Header: http.Header{"Last-Event-Id": []string{"42"}}, URL: &url.URL{RawQuery: "after=11"}}
	if cursor := eventCursor(request); cursor != 42 {
		t.Fatalf("expected cursor 42, got %d", cursor)
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
