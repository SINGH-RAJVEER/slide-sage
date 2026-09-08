package observability

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/contrib/detectors/gcp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
)

// Telemetry owns the lifecycle of the three OTLP signal providers. Processes
// create one instance during startup and shut it down before exiting so
// buffered spans, metric points, and log records are flushed.
type Telemetry struct {
	config         Config
	tracerProvider *sdktrace.TracerProvider
	meterProvider  *metric.MeterProvider
	loggerProvider *log.LoggerProvider

	shutdownOnce sync.Once
}

// Setup installs global tracer, meter, and logger providers configured for
// OTLP export and returns the Telemetry instance that must be shut down.
// A disabled configuration leaves the default no-op providers installed so the
// rest of the code can always use the otel package globals unconditionally.
func Setup(ctx context.Context, config Config) (*Telemetry, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}
	telemetry := &Telemetry{config: config}
	if config.Disabled {
		return telemetry, nil
	}

	telemetryResource, err := telemetry.resource(ctx)
	if err != nil {
		return nil, err
	}
	if !config.TracesDisabled {
		providerOptions := []sdktrace.TracerProviderOption{
			sdktrace.WithResource(telemetryResource),
			sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(config.SamplingRatio))),
		}
		traceExporter, err := telemetry.newTraceExporter(ctx)
		if err != nil {
			return nil, err
		}
		telemetry.tracerProvider = sdktrace.NewTracerProvider(append(providerOptions, sdktrace.WithBatcher(traceExporter))...)
		otel.SetTracerProvider(telemetry.tracerProvider)
	}

	if !config.MetricsDisabled {
		meterExporter, err := telemetry.newMetricExporter(ctx)
		if err != nil {
			_ = telemetry.Shutdown(context.Background())
			return nil, err
		}
		interval := time.Duration(config.MetricInterval) * time.Millisecond
		telemetry.meterProvider = metric.NewMeterProvider(
			metric.WithResource(telemetryResource),
			metric.WithReader(metric.NewPeriodicReader(meterExporter, metric.WithInterval(interval))),
		)
		otel.SetMeterProvider(telemetry.meterProvider)
	}

	if !config.LogsDisabled {
		logExporter, err := telemetry.newLogExporter(ctx)
		if err != nil {
			_ = telemetry.Shutdown(context.Background())
			return nil, err
		}
		telemetry.loggerProvider = log.NewLoggerProvider(
			log.WithResource(telemetryResource),
			log.WithProcessor(log.NewBatchProcessor(logExporter)),
		)
		global.SetLoggerProvider(telemetry.loggerProvider)
	}

	return telemetry, nil
}

// Logger returns an slog.Logger that writes human-readable text to standard
// output and mirrors every record into the OTLP logs pipeline with trace
// correlation. It works whether or not the SDK is enabled; when disabled the
// bridge is omitted and only local text logging happens.
func (t *Telemetry) Logger() *slog.Logger {
	textHandler := slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	correlated := newTraceContextHandler(textHandler)
	if t.loggerProvider == nil {
		return slog.New(correlated)
	}
	bridge := otelslog.NewHandler(t.config.ServiceName, otelslog.WithLoggerProvider(t.loggerProvider))
	return slog.New(newMultiHandler(correlated, bridge))
}

// Shutdown flushes and stops all providers. It is safe to call multiple times;
// only the first call performs work. Shutdown errors are joined because a
// failed metrics flush should not hide a trace export failure.
func (t *Telemetry) Shutdown(ctx context.Context) error {
	var shutdownErrors []error
	t.shutdownOnce.Do(func() {
		if t.loggerProvider != nil {
			if err := t.loggerProvider.Shutdown(ctx); err != nil {
				shutdownErrors = append(shutdownErrors, err)
			}
		}
		if t.meterProvider != nil {
			if err := t.meterProvider.Shutdown(ctx); err != nil {
				shutdownErrors = append(shutdownErrors, err)
			}
		}
		if t.tracerProvider != nil {
			if err := t.tracerProvider.Shutdown(ctx); err != nil {
				shutdownErrors = append(shutdownErrors, err)
			}
		}
	})
	return errors.Join(shutdownErrors...)
}

func init() {
	// W3C trace-context propagation must be active even when OTLP export is
	// disabled so spans still correlate across processes.
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))
}

func (t *Telemetry) resource(ctx context.Context) (*resource.Resource, error) {
	attributes := []attribute.KeyValue{
		semconv.ServiceName(t.config.ServiceName),
		semconv.DeploymentEnvironmentName(t.config.Environment),
	}
	if t.config.ServiceVersion != "" {
		attributes = append(attributes, semconv.ServiceVersion(t.config.ServiceVersion))
	}
	options := []resource.Option{
		resource.WithFromEnv(),
		resource.WithTelemetrySDK(),
	}
	if os.Getenv("K_SERVICE") != "" {
		options = append(options, resource.WithDetectors(gcp.NewDetector()))
	}
	options = append(options, resource.WithAttributes(attributes...))
	detected, err := resource.New(ctx, options...)
	if errors.Is(err, resource.ErrPartialResource) {
		return detected, nil
	}
	return detected, err
}

func (t *Telemetry) newTraceExporter(ctx context.Context) (sdktrace.SpanExporter, error) {
	if t.config.Protocol == protocolHTTPProtobuf {
		return otlptracehttp.New(ctx, otlptracehttp.WithEndpointURL(signalEndpoint(t.config.Endpoint, "traces")))
	}
	options := []otlptracegrpc.Option{otlptracegrpc.WithEndpoint(t.config.Endpoint)}
	if t.config.Insecure {
		options = append(options, otlptracegrpc.WithInsecure())
	}
	return otlptracegrpc.New(ctx, options...)
}

func (t *Telemetry) newMetricExporter(ctx context.Context) (metric.Exporter, error) {
	if t.config.Protocol == protocolHTTPProtobuf {
		return otlpmetrichttp.New(
			ctx,
			otlpmetrichttp.WithEndpointURL(signalEndpoint(t.config.Endpoint, "metrics")),
			otlpmetrichttp.WithTemporalitySelector(deltaTemporality),
		)
	}
	options := []otlpmetricgrpc.Option{otlpmetricgrpc.WithEndpoint(t.config.Endpoint)}
	if t.config.Insecure {
		options = append(options, otlpmetricgrpc.WithInsecure())
	}
	return otlpmetricgrpc.New(ctx, options...)
}

func (t *Telemetry) newLogExporter(ctx context.Context) (log.Exporter, error) {
	if t.config.Protocol == protocolHTTPProtobuf {
		return otlploghttp.New(ctx, otlploghttp.WithEndpointURL(signalEndpoint(t.config.Endpoint, "logs")))
	}
	options := []otlploggrpc.Option{otlploggrpc.WithEndpoint(t.config.Endpoint)}
	if t.config.Insecure {
		options = append(options, otlploggrpc.WithInsecure())
	}
	return otlploggrpc.New(ctx, options...)
}

func signalEndpoint(endpoint string, signal string) string {
	parsed, _ := url.Parse(endpoint)
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/v1/" + signal
	return parsed.String()
}

func deltaTemporality(metric.InstrumentKind) metricdata.Temporality {
	return metricdata.DeltaTemporality
}
