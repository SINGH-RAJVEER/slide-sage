package observability

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"go.opentelemetry.io/otel/trace"
)

// captureLogs redirects the default slog logger into a buffer for one test
// and restores the previous default afterwards.
func captureLogs(t *testing.T) *bytes.Buffer {
	t.Helper()
	buffer := &bytes.Buffer{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(buffer, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return buffer
}

func TestMiddlewareServesRequestsAndLogsAccess(t *testing.T) {
	logs := captureLogs(t)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
	})
	recorder := httptest.NewRecorder()
	Middleware(mux).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/health", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status: %d", recorder.Code)
	}
	for _, expected := range []string{"route=/health", "status=200", "component=http"} {
		if !strings.Contains(logs.String(), expected) {
			t.Fatalf("access log missing %q: %q", expected, logs.String())
		}
	}
}

func TestRecoveryReturnsErrorEnvelopeAndRecordsSpan(t *testing.T) {
	logs := captureLogs(t)
	spanRecorder := tracetest.NewSpanRecorder()
	tracerProvider := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(spanRecorder))
	defer func() { _ = tracerProvider.Shutdown(context.Background()) }()
	previousProvider := otel.GetTracerProvider()
	otel.SetTracerProvider(tracerProvider)
	defer otel.SetTracerProvider(previousProvider)

	panicHandler := Recovery(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		panic("boom")
	}))
	serverSpanContext, serverSpan := tracerProvider.Tracer("test").Start(context.Background(), "server")
	recorder := httptest.NewRecorder()

	request := httptest.NewRequest(http.MethodPost, "/panic-route", nil).WithContext(serverSpanContext)
	panicHandler.ServeHTTP(recorder, request)
	serverSpan.End()

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status: %d", recorder.Code)
	}
	var envelope struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil || envelope.Error.Message != "Internal server error" {
		t.Fatalf("error envelope: %v %q", err, recorder.Body.String())
	}
	if !strings.Contains(logs.String(), "boom") {
		t.Fatalf("panic was not logged: %q", logs.String())
	}
	foundException := false
	for _, span := range spanRecorder.Ended() {
		if span.Status().Code != codes.Error {
			continue
		}
		for _, event := range span.Events() {
			if event.Name == "exception" {
				foundException = true
			}
		}
	}
	if !foundException {
		t.Fatal("panic was not recorded as an exception on an error span")
	}
}

func TestRequestLoggingCapturesStatusAndBytes(t *testing.T) {
	logs := captureLogs(t)
	recorder := httptest.NewRecorder()
	RequestLogging(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusTeapot)
		_, _ = writer.Write([]byte("payload"))
	})).ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/anything", nil))

	for _, expected := range []string{"status=418", "bytes=7", "method=POST"} {
		if !strings.Contains(logs.String(), expected) {
			t.Fatalf("log missing %q: %q", expected, logs.String())
		}
	}
}

func TestMetricsMiddlewareCompletesRequests(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /metrics-probe", func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusNoContent)
	})
	recorder := httptest.NewRecorder()
	Metrics(mux).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/metrics-probe", nil))
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("metrics middleware broke request handling: %d", recorder.Code)
	}
}

func TestTracingExtractsW3CTraceContext(t *testing.T) {
	spanRecorder := tracetest.NewSpanRecorder()
	tracerProvider := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(spanRecorder), sdktrace.WithSampler(sdktrace.AlwaysSample()))
	defer func() { _ = tracerProvider.Shutdown(context.Background()) }()
	previousProvider := otel.GetTracerProvider()
	otel.SetTracerProvider(tracerProvider)
	defer otel.SetTracerProvider(previousProvider)

	request := httptest.NewRequest(http.MethodGet, "/traced", nil)
	request.Header.Set("traceparent", "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
	Tracing(http.HandlerFunc(func(writer http.ResponseWriter, req *http.Request) {
		if !trace.SpanContextFromContext(req.Context()).IsValid() {
			t.Error("handler context did not contain a valid span")
		}
	})).ServeHTTP(httptest.NewRecorder(), request)

	spans := spanRecorder.Ended()
	if len(spans) != 1 {
		t.Fatalf("expected exactly one server span, got %d", len(spans))
	}
	if spans[0].SpanContext().TraceID().String() != "4bf92f3577b34da6a3ce929d0e0e4736" {
		t.Fatalf("remote trace id not honored: %s", spans[0].SpanContext().TraceID())
	}
}
