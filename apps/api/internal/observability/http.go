package observability

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.opentelemetry.io/otel/trace"
)

// Middleware wraps an HTTP handler with the full observability stack:
// W3C trace-context extraction, a server span per request, RED metrics, an
// access log line, and panic recovery that records the panic on the span.
// The outermost layer is recovery so panics raised anywhere below still
// produce a completed span and metric sample.
func Middleware(next http.Handler) http.Handler {
	return Recovery(RequestLogging(Tracing(Metrics(next))))
}

// Tracing adds OpenTelemetry server spans using the standard otelhttp
// instrumentation. Span names prefer the ServeMux route pattern so spans stay
// low-cardinality.
func Tracing(next http.Handler) http.Handler {
	return otelhttp.NewHandler(next, "slidesage", otelhttp.WithSpanNameFormatter(func(_ string, request *http.Request) string {
		if pattern := request.Pattern; pattern != "" {
			return pattern
		}
		return request.Method + " " + request.URL.Path
	}))
}

type metricsBundle struct {
	duration    metric.Float64Histogram
	requests    metric.Int64Counter
	active      metric.Int64UpDownCounter
	panicsTotal metric.Int64Counter
}

var metricsBundleOnce = func() func() metricsBundle {
	var once sync.Once
	var bundle metricsBundle
	return func() metricsBundle {
		once.Do(func() { bundle = newMetricsBundle() })
		return bundle
	}
}()

func newMetricsBundle() metricsBundle {
	meter := otel.Meter("github.com/SINGH-RAJVEER/SlideSage/apps/api")
	bundle := metricsBundle{}
	if duration, err := meter.Float64Histogram(
		"http.server.request.duration",
		metric.WithDescription("Duration of HTTP server requests"),
		metric.WithUnit("s"),
		metric.WithExplicitBucketBoundaries(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
	); err == nil {
		bundle.duration = duration
	}
	if requests, err := meter.Int64Counter("http.server.requests", metric.WithDescription("Number of HTTP requests processed")); err == nil {
		bundle.requests = requests
	}
	if active, err := meter.Int64UpDownCounter("http.server.active_requests", metric.WithDescription("Number of HTTP requests currently in flight")); err == nil {
		bundle.active = active
	}
	if panics, err := meter.Int64Counter("http.server.panics", metric.WithDescription("Number of recovered HTTP handler panics")); err == nil {
		bundle.panicsTotal = panics
	}
	return bundle
}

// Metrics records RED metrics for every request. Route labels come from the
// ServeMux pattern after the inner handlers run, keeping cardinality bounded
// by the number of registered routes.
func Metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		start := time.Now()
		bundle := metricsBundleOnce()
		if bundle.active != nil {
			bundle.active.Add(request.Context(), 1)
		}
		recorder := &metricsResponseWriter{ResponseWriter: writer, status: http.StatusOK}
		defer func() {
			if bundle.active != nil {
				bundle.active.Add(request.Context(), -1)
			}
			route := request.Pattern
			if route == "" {
				route = "unmatched"
			}
			attributes := metric.WithAttributeSet(attribute.NewSet(
				attribute.String(string(semconv.HTTPRequestMethodKey), request.Method),
				attribute.String(string(semconv.HTTPRouteKey), route),
				attribute.Int(string(semconv.HTTPResponseStatusCodeKey), recorder.status),
				attribute.String(string(semconv.URLSchemeKey), schemeOf(request)),
			))
			if bundle.duration != nil {
				bundle.duration.Record(request.Context(), time.Since(start).Seconds(), attributes)
			}
			if bundle.requests != nil {
				bundle.requests.Add(request.Context(), 1, attributes)
			}
		}()
		next.ServeHTTP(recorder, request)
	})
}

// RequestLogging writes one structured access-log record per request,
// including trace identifiers for correlation with spans and OTLP logs.
func RequestLogging(next http.Handler) http.Handler {
	logger := slog.Default()
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		start := time.Now()
		recorder := &loggingResponseWriter{ResponseWriter: writer, status: http.StatusOK}
		defer func() {
			attributes := []slog.Attr{
				slog.String("component", "http"),
				slog.String("method", request.Method),
				slog.String("route", routeLabel(request)),
				slog.String("path", request.URL.Path),
				slog.Int("status", recorder.status),
				slog.Int("bytes", recorder.bytes),
				slog.Duration("duration_ms", time.Since(start)),
				slog.String("remote_addr", request.RemoteAddr),
			}
			if span := trace.SpanContextFromContext(request.Context()); span.IsValid() {
				attributes = append(attributes, slog.String("trace_id", span.TraceID().String()))
			}
			logger.LogAttrs(request.Context(), slog.LevelInfo, "request", attributes...)
		}()
		next.ServeHTTP(recorder, request)
	})
}

// Recovery converts panics into structured errors, records them on the active
// span, increments the panic counter, and answers with the same JSON error
// envelope used by the rest of the API.
func Recovery(next http.Handler) http.Handler {
	logger := slog.Default()
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		defer func() {
			recovered := recover()
			if recovered == nil {
				return
			}
			if counter := metricsBundleOnce().panicsTotal; counter != nil {
				counter.Add(request.Context(), 1)
			}
			span := trace.SpanFromContext(request.Context())
			span.SetStatus(codes.Error, "panic")
			span.RecordError(toError(recovered))
			logger.ErrorContext(request.Context(), "panic serving request",
				slog.Any("panic", recovered),
				slog.String("method", request.Method),
				slog.String("path", request.URL.Path),
			)
			writeJSONError(writer, http.StatusInternalServerError, "Internal server error")
		}()
		next.ServeHTTP(writer, request)
	})
}

// HTTPTransport instruments outbound HTTP clients so provider calls made by
// the generation pipeline become client spans that propagate trace context to
// downstream services.
func HTTPTransport(base http.RoundTripper) http.RoundTripper {
	return otelhttp.NewTransport(base)
}

func toError(value any) error {
	if err, ok := value.(error); ok {
		return err
	}
	return &panicValue{value: value}
}

type panicValue struct{ value any }

func (err *panicValue) Error() string {
	if text, ok := err.value.(string); ok {
		return text
	}
	return "non-error panic value"
}

type metricsResponseWriter struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (writer *metricsResponseWriter) WriteHeader(status int) {
	if !writer.wroteHeader {
		writer.status = status
		writer.wroteHeader = true
	}
	writer.ResponseWriter.WriteHeader(status)
}

func (writer *metricsResponseWriter) Flush() {
	if flusher, ok := writer.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

type loggingResponseWriter struct {
	http.ResponseWriter
	status      int
	bytes       int
	wroteHeader bool
}

func (writer *loggingResponseWriter) Write(payload []byte) (int, error) {
	written, err := writer.ResponseWriter.Write(payload)
	writer.bytes += written
	return written, err
}

func (writer *loggingResponseWriter) WriteHeader(status int) {
	if !writer.wroteHeader {
		writer.status = status
		writer.wroteHeader = true
	}
	writer.ResponseWriter.WriteHeader(status)
}

func (writer *loggingResponseWriter) Flush() {
	if flusher, ok := writer.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// routeLabel returns a low-cardinality request label. ServeMux only sets
// request.Pattern on handlers it invokes directly, so middleware layered
// outside the mux falls back to a normalized path where identifier segments
// are collapsed into ":id".
func routeLabel(request *http.Request) string {
	if request.Pattern != "" {
		return request.Pattern
	}
	return normalizePath(request.URL.Path)
}

var (
	uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	numericLike = regexp.MustCompile(`^[0-9]+$`)
	longToken   = regexp.MustCompile(`^[A-Za-z0-9_-]{24,}$`)
)

func normalizePath(path string) string {
	segments := strings.Split(path, "/")
	for index, segment := range segments {
		if segment == "" {
			continue
		}
		if uuidPattern.MatchString(segment) || numericLike.MatchString(segment) || longToken.MatchString(segment) {
			segments[index] = ":id"
		}
	}
	return strings.Join(segments, "/")
}

func schemeOf(request *http.Request) string {
	if request.TLS != nil {
		return "https"
	}
	return "http"
}

func writeJSONError(writer http.ResponseWriter, status int, message string) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]string{"message": message}})
}
