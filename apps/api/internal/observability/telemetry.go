package observability

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetricgrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/log/global"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/sdk/metric"
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
// OTLP/gRPC export and returns the Telemetry instance that must be shut down.
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

	providerOptions := []sdktrace.TracerProviderOption{
		sdktrace.WithResource(telemetry.resource()),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(config.SamplingRatio))),
	}
	traceExporter, err := otlptracegrpc.New(ctx, telemetry.traceExporterOptions()...)
	if err != nil {
		return nil, err
	}
	telemetry.tracerProvider = sdktrace.NewTracerProvider(append(providerOptions, sdktrace.WithBatcher(traceExporter))...)
	otel.SetTracerProvider(telemetry.tracerProvider)

	meterExporter, err := otlpmetricgrpc.New(ctx, telemetry.metricExporterOptions()...)
	if err != nil {
		_ = telemetry.Shutdown(context.Background())
		return nil, err
	}
	interval := time.Duration(config.MetricInterval) * time.Millisecond
	telemetry.meterProvider = metric.NewMeterProvider(
		metric.WithResource(telemetry.resource()),
		metric.WithReader(metric.NewPeriodicReader(meterExporter, metric.WithInterval(interval))),
	)
	otel.SetMeterProvider(telemetry.meterProvider)

	logExporter, err := otlploggrpc.New(ctx, telemetry.logExporterOptions()...)
	if err != nil {
		_ = telemetry.Shutdown(context.Background())
		return nil, err
	}
	telemetry.loggerProvider = log.NewLoggerProvider(
		log.WithResource(telemetry.resource()),
		log.WithProcessor(log.NewBatchProcessor(logExporter)),
	)
	global.SetLoggerProvider(telemetry.loggerProvider)

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

func (t *Telemetry) resource() *resource.Resource {
	attributes := []attribute.KeyValue{
		semconv.ServiceName(t.config.ServiceName),
		semconv.DeploymentEnvironmentName(t.config.Environment),
	}
	if t.config.ServiceVersion != "" {
		attributes = append(attributes, semconv.ServiceVersion(t.config.ServiceVersion))
	}
	return resource.NewSchemaless(attributes...)
}

func (t *Telemetry) traceExporterOptions() []otlptracegrpc.Option {
	options := []otlptracegrpc.Option{otlptracegrpc.WithEndpoint(t.config.Endpoint)}
	if t.config.Insecure {
		options = append(options, otlptracegrpc.WithInsecure())
	}
	return options
}

func (t *Telemetry) metricExporterOptions() []otlpmetricgrpc.Option {
	options := []otlpmetricgrpc.Option{otlpmetricgrpc.WithEndpoint(t.config.Endpoint)}
	if t.config.Insecure {
		options = append(options, otlpmetricgrpc.WithInsecure())
	}
	return options
}

func (t *Telemetry) logExporterOptions() []otlploggrpc.Option {
	options := []otlploggrpc.Option{otlploggrpc.WithEndpoint(t.config.Endpoint)}
	if t.config.Insecure {
		options = append(options, otlploggrpc.WithInsecure())
	}
	return options
}
