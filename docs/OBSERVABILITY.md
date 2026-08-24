# Observability

The Go API and generation worker emit OpenTelemetry traces, metrics, and logs
over OTLP/gRPC. Everything is configured through standard `OTEL_*` environment
variables and lives in `apps/api/internal/observability`.

## Signals

### Traces

Every HTTP request handled by the API produces a server span. The worker opens
one span per generation job attempt, and outbound AI provider requests become
client spans through the instrumented HTTP transport, so a single trace covers
submission, planning, drafting, and provider latency. W3C `traceparent` is
propagated in both directions; spans carry attributes such as
`generation.job.id`, `generation.job.attempt`, `generation.job.outcome`, and
`generation.tokens.used`.

Span names use the ServeMux route pattern where available. Middleware layered
outside the mux falls back to a normalized path with identifier segments
collapsed to `:id` to keep labels low-cardinality.

### Metrics

| Instrument | Type | Description |
| --- | --- | --- |
| `http.server.request.duration` | Histogram (s) | RED duration per method, route, status code, scheme |
| `http.server.requests` | Counter | Request count with the same dimensions |
| `http.server.active_requests` | UpDownCounter | In-flight HTTP requests |
| `http.server.panics` | Counter | Recovered handler panics |
| `generation.job.duration` | Histogram (s) | Worker wall-clock time per job attempt |
| `generation.job.attempts` | Counter | Job outcomes per attempt |
| `generation.tokens.used` | Counter | AI provider tokens consumed, by presentation kind |

### Logs

Both processes log through `log/slog`. Each record goes to stdout as text and
mirrors into the OTLP logs pipeline. Records produced inside an active span
include `trace_id` and `span_id`, so log lines, spans, and metrics can be
correlated. Panics recovered by the API middleware are logged as errors,
recorded on the active span as exceptions, and counted.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Empty | OTLP/gRPC collector endpoint. Leave empty or set `OTEL_SDK_DISABLED=true` to run without telemetry export |
| `OTEL_EXPORTER_OTLP_INSECURE` | `false` | Use plaintext gRPC, for example a local collector without TLS |
| `OTEL_SERVICE_NAME` | `slidesage-api` or `slidesage-worker` | Resource service name |
| `OTEL_SERVICE_VERSION` | Empty | Resource service version |
| `OTEL_RESOURCE_ENVIRONMENT` | `ENVIRONMENT`, then `NODE_ENV`, then `development` | Deployment environment label |
| `OTEL_TRACES_SAMPLING_RATIO` | `1` | Head-sampling ratio for root spans; child spans follow their parent |
| `OTEL_METRIC_EXPORT_INTERVAL` | `60000` | Metric reader interval in milliseconds |

The SDK starts only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Without it, the
processes behave exactly as before: local text logs, no network exporters.
Invalid numeric values fall back to defaults instead of blocking startup.

## Local development

Point the endpoint at any OTLP/gRPC collector. For example, run Jaeger's
all-in-one image and set:

```
OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317
OTEL_EXPORTER_OTLP_INSECURE=true
```

Then open the Jaeger UI at `http://localhost:16686` to browse traces from the
API, worker, and AI provider calls in one view.

## Lifecycle

`observability.Setup` installs global tracer, meter, and logger providers plus
the W3C propagator and returns a handle whose `Shutdown` flushes all three
signals. Both `cmd/api` and `cmd/worker` defer this shutdown with a five second
budget during graceful termination, so buffered telemetry is exported before
exit.
