package observability

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

func TestTraceContextHandlerAddsSpanIdentifiers(t *testing.T) {
	buffer := &bytes.Buffer{}
	handler := newTraceContextHandler(slog.NewTextHandler(buffer, nil))
	logger := slog.New(handler)

	tracerProvider := sdktrace.NewTracerProvider()
	defer func() { _ = tracerProvider.Shutdown(context.Background()) }()
	tracer := tracerProvider.Tracer("test")
	ctx, span := tracer.Start(context.Background(), "operation")
	spanContext := span.SpanContext()
	logger.InfoContext(ctx, "hello")
	span.End()

	output := buffer.String()
	if !strings.Contains(output, spanContext.TraceID().String()) || !strings.Contains(output, spanContext.SpanID().String()) {
		t.Fatalf("log output missing trace context: %q", output)
	}
}

func TestTraceContextHandlerWithoutSpanStillLogs(t *testing.T) {
	buffer := &bytes.Buffer{}
	handler := newTraceContextHandler(slog.NewTextHandler(buffer, nil))
	slog.New(handler).Info("plain")
	if !strings.Contains(buffer.String(), "plain") {
		t.Fatalf("record lost without a span: %q", buffer.String())
	}
}

func TestMultiHandlerFansRecordsOut(t *testing.T) {
	first := &bytes.Buffer{}
	second := &bytes.Buffer{}
	handler := newMultiHandler(
		newTraceContextHandler(slog.NewTextHandler(first, nil)),
		newTraceContextHandler(slog.NewTextHandler(second, nil)),
	)
	slog.New(handler).Warn("fanned")
	for name, buffer := range map[string]*bytes.Buffer{"first": first, "second": second} {
		if !strings.Contains(buffer.String(), "fanned") {
			t.Fatalf("%s handler did not receive the record: %q", name, buffer.String())
		}
	}
}
