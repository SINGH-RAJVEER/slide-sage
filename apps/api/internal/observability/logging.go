package observability

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/otel/trace"
)

// traceContextHandler copies the active span's identifiers into every log
// record so local text logs can be correlated with distributed traces. The
// OTLP bridge already injects this context itself, which is why the telemetry
// logger wraps the text handler with this one and passes the bridge through
// unmodified.
type traceContextHandler struct {
	inner slog.Handler
	attrs []slog.Attr
	group string
}

func newTraceContextHandler(inner slog.Handler) slog.Handler {
	return &traceContextHandler{inner: inner}
}

func (handler *traceContextHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return handler.inner.Enabled(ctx, level)
}

func (handler *traceContextHandler) Handle(ctx context.Context, record slog.Record) error {
	if span := trace.SpanContextFromContext(ctx); span.IsValid() {
		record.AddAttrs(slog.String("trace_id", span.TraceID().String()), slog.String("span_id", span.SpanID().String()))
	}
	record.AddAttrs(handler.attrs...)
	return handler.inner.Handle(ctx, record)
}

func (handler *traceContextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	if len(attrs) == 0 {
		return handler
	}
	merged := make([]slog.Attr, 0, len(handler.attrs)+len(attrs))
	merged = append(merged, handler.attrs...)
	merged = append(merged, attrs...)
	return &traceContextHandler{inner: handler.inner, attrs: merged, group: handler.group}
}

func (handler *traceContextHandler) WithGroup(name string) slog.Handler {
	if name == "" {
		return handler
	}
	return &traceContextHandler{inner: handler.inner.WithGroup(name), attrs: handler.attrs, group: handler.group + "." + name}
}

// multiHandler fans every record out to several handlers, mirroring the
// behavior of the writer returned by io.MultiWriter.
type multiHandler struct {
	handlers []slog.Handler
}

func newMultiHandler(handlers ...slog.Handler) slog.Handler {
	return &multiHandler{handlers: handlers}
}

func (handler *multiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, inner := range handler.handlers {
		if inner.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (handler *multiHandler) Handle(ctx context.Context, record slog.Record) error {
	var firstError error
	for _, inner := range handler.handlers {
		if !inner.Enabled(ctx, record.Level) {
			continue
		}
		if err := inner.Handle(ctx, record.Clone()); err != nil && firstError == nil {
			firstError = err
		}
	}
	return firstError
}

func (handler *multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	inner := make([]slog.Handler, len(handler.handlers))
	for index, current := range handler.handlers {
		inner[index] = current.WithAttrs(attrs)
	}
	return &multiHandler{handlers: inner}
}

func (handler *multiHandler) WithGroup(name string) slog.Handler {
	inner := make([]slog.Handler, len(handler.handlers))
	for index, current := range handler.handlers {
		inner[index] = current.WithGroup(name)
	}
	return &multiHandler{handlers: inner}
}
