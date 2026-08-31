package generation

import (
	"context"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// The generation pipeline reports spans and metrics through the global
// OpenTelemetry providers installed by the observability package during
// process startup. When telemetry is disabled these handles stay no-ops.
var (
	tracer     = otel.Tracer("github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/generation")
	meter      = otel.Meter("github.com/SINGH-RAJVEER/SlideSage/apps/api/internal/generation")
	jobBuckets = []float64{0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300}
)

type jobMetrics struct {
	duration metric.Float64Histogram
	attempts metric.Int64Counter
	tokens   metric.Int64Counter
}

func newJobMetrics() jobMetrics {
	metrics := jobMetrics{}
	if histogram, err := meter.Float64Histogram(
		"generation.job.duration",
		metric.WithDescription("Wall-clock duration of generation job processing"),
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(jobBuckets...),
	); err == nil {
		metrics.duration = histogram
	}
	if attempts, err := meter.Int64Counter(
		"generation.job.attempts",
		metric.WithDescription("Generation job processing outcomes per attempt"),
	); err == nil {
		metrics.attempts = attempts
	}
	if tokens, err := meter.Int64Counter(
		"generation.tokens.used",
		metric.WithDescription("Total AI provider tokens consumed by generation jobs"),
	); err == nil {
		metrics.tokens = tokens
	}
	return metrics
}

var jobMetricsOnce = func() func() jobMetrics {
	var once sync.Once
	var metrics jobMetrics
	return func() jobMetrics {
		once.Do(func() { metrics = newJobMetrics() })
		return metrics
	}
}()

func metricsFor() jobMetrics {
	return jobMetricsOnce()
}

func newJobArgs(ctx context.Context, jobID string) JobArgs {
	carrier := propagation.MapCarrier{}
	otel.GetTextMapPropagator().Inject(ctx, carrier)
	return JobArgs{
		JobID:       jobID,
		TraceParent: carrier.Get("traceparent"),
		TraceState:  carrier.Get("tracestate"),
	}
}

// startJobSpan opens the worker-side span covering one processing attempt of a
// durable generation job.
func startJobSpan(ctx context.Context, args JobArgs, attempt int) (context.Context, trace.Span) {
	carrier := propagation.MapCarrier{
		"traceparent": args.TraceParent,
		"tracestate":  args.TraceState,
	}
	ctx = otel.GetTextMapPropagator().Extract(ctx, carrier)
	return tracer.Start(ctx, "generation.job",
		trace.WithAttributes(
			attribute.String("generation.job.id", args.JobID),
			attribute.Int("generation.job.attempt", attempt),
			attribute.String("generation.queue", generationQueue),
		),
	)
}

// finishJobSpan closes the job span and records duration and outcome metrics.
func finishJobSpan(span trace.Span, started time.Time, attempt int, err error) {
	outcome := "succeeded"
	if err != nil {
		outcome = "failed_attempt"
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
	}
	attributes := metric.WithAttributeSet(attribute.NewSet(
		attribute.Int("generation.job.attempt", attempt),
		attribute.String("generation.job.outcome", outcome),
	))
	metrics := metricsFor()
	if metrics.duration != nil {
		metrics.duration.Record(context.Background(), time.Since(started).Seconds(), attributes)
	}
	if metrics.attempts != nil {
		metrics.attempts.Add(context.Background(), 1, attributes)
	}
	span.SetAttributes(attribute.String("generation.job.outcome", outcome))
	span.End()
}

// recordTokenUsage counts provider tokens on the active span and the global
// token counter so cost dashboards can aggregate by presentation kind.
func recordTokenUsage(ctx context.Context, kind string, tokens int) {
	if tokens <= 0 {
		return
	}
	trace.SpanFromContext(ctx).SetAttributes(attribute.Int("generation.tokens.used", tokens))
	if metrics := metricsFor(); metrics.tokens != nil {
		metrics.tokens.Add(ctx, int64(tokens), metric.WithAttributes(attribute.String("generation.kind", kind)))
	}
}
