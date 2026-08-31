package generation

import (
	"context"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestJobArgsPropagateSubmissionTraceToWorker(t *testing.T) {
	spanRecorder := tracetest.NewSpanRecorder()
	tracerProvider := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithSpanProcessor(spanRecorder),
	)
	defer func() { _ = tracerProvider.Shutdown(context.Background()) }()
	previousProvider := otel.GetTracerProvider()
	previousPropagator := otel.GetTextMapPropagator()
	otel.SetTracerProvider(tracerProvider)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	defer otel.SetTracerProvider(previousProvider)
	defer otel.SetTextMapPropagator(previousPropagator)

	submissionContext, submissionSpan := tracerProvider.Tracer("test").Start(context.Background(), "submit")
	args := newJobArgs(submissionContext, "job_1")
	_, jobSpan := startJobSpan(context.Background(), args, 1)
	jobSpan.End()
	submissionSpan.End()

	if args.TraceParent == "" {
		t.Fatal("job arguments did not capture traceparent")
	}
	spans := spanRecorder.Ended()
	if len(spans) != 2 {
		t.Fatalf("ended spans: %d", len(spans))
	}
	var workerTraceID string
	for _, span := range spans {
		if span.Name() == "generation.job" {
			workerTraceID = span.SpanContext().TraceID().String()
		}
	}
	if workerTraceID != submissionSpan.SpanContext().TraceID().String() {
		t.Fatalf("worker trace ID %q does not match submission trace ID %q", workerTraceID, submissionSpan.SpanContext().TraceID())
	}
}
