# Observability

The Go API, the generation worker, and the preview renderer emit OpenTelemetry traces, metrics, and logs over OTLP. The exporter supports gRPC for collectors and HTTP/protobuf for direct intake services. Everything is configured through standard `OTEL_*` environment variables and lives in `apps/api/internal/observability`.

## Signals

### Traces

Every HTTP request handled by the API produces a server span. The API persists W3C trace context in each River job, the worker opens a child span per generation attempt, and outbound AI provider requests become client spans through the instrumented HTTP transport. A single trace can therefore cover submission, queued work, planning, drafting, and provider latency. Spans carry attributes such as `generation.job.id`, `generation.job.attempt`, `generation.job.outcome`, and `generation.tokens.used`.

HTTP span names use the bounded `HTTP <method>` form. The resolved ServeMux pattern is stored in `http.route` and used by metrics and access logs. Unmatched requests use the fixed `unmatched` route. This prevents request paths from creating unbounded Datadog resources or metric tags.

### Metrics

| Instrument                     | Type          | Description                                         |
| ------------------------------ | ------------- | --------------------------------------------------- |
| `http.server.request.duration` | Histogram (s) | RED duration per method, route, status code, scheme |
| `http.server.requests`         | Counter       | Request count with the same dimensions              |
| `http.server.active_requests`  | UpDownCounter | In-flight HTTP requests                             |
| `http.server.panics`           | Counter       | Recovered handler panics                            |
| `generation.job.duration`      | Histogram (s) | Worker wall-clock time per job attempt              |
| `generation.job.attempts`      | Counter       | Job outcomes per attempt                            |
| `generation.tokens.used`       | Counter       | AI provider tokens consumed, by presentation kind   |

### Logs

All three processes log through `log/slog`. Each record goes to stdout as text and mirrors into the OTLP logs pipeline. Records produced inside an active span include `trace_id` and `span_id`, so log lines, spans, and metrics can be correlated. Panics recovered by the API middleware are logged as errors, recorded on the active span as exceptions, and counted.

## Configuration

| Variable                      | Default                                            | Purpose                                                                                                   |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Empty                                              | Common OTLP endpoint. Leave empty or set `OTEL_SDK_DISABLED=true` to disable export                         |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc`                                             | `grpc` or `http/protobuf`                                                                                   |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Empty                                              | Comma-separated request headers in `key=value` form                                                         |
| `OTEL_EXPORTER_OTLP_INSECURE` | `false`                                            | Use plaintext gRPC, for example a local collector without TLS                                              |
| `OTEL_SERVICE_NAME`           | `slidesage-api`, `-worker`, or `-preview`          | Resource service name                                                                                      |
| `OTEL_SERVICE_VERSION`        | Empty                                              | Resource service version                                                                                   |
| `OTEL_RESOURCE_ENVIRONMENT`   | `ENVIRONMENT`, then `NODE_ENV`, then `development` | Deployment environment label                                                                               |
| `OTEL_RESOURCE_ATTRIBUTES`    | Empty                                              | Extra comma-separated resource attributes                                                                  |
| `OTEL_TRACES_EXPORTER`        | `otlp`                                             | Set to `none` to disable trace export                                                                       |
| `OTEL_METRICS_EXPORTER`       | `otlp`                                             | Set to `none` to disable metric export                                                                      |
| `OTEL_LOGS_EXPORTER`          | `otlp`                                             | Set to `none` to disable OTLP log export                                                                    |
| `OTEL_TRACES_SAMPLING_RATIO`  | `1`                                                | Head-sampling ratio for root spans; child spans follow their parent                                        |
| `OTEL_METRIC_EXPORT_INTERVAL` | `60000`                                            | Metric reader interval in milliseconds                                                                     |

The SDK starts only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Without it, the processes behave exactly as before: local text logs, no network exporters. Invalid numeric values fall back to defaults instead of blocking startup.

## Local development

Point the endpoint at any OTLP/gRPC collector. For example, run Jaeger's all-in-one image and set:

```
OTEL_EXPORTER_OTLP_ENDPOINT=localhost:4317
OTEL_EXPORTER_OTLP_INSECURE=true
```

Then open the Jaeger UI at `http://localhost:16686` to browse traces from the API, worker, and AI provider calls in one view.

## Datadog on Cloud Run

Cloud Run cannot host a per-node Datadog Agent, so direct OTLP intake is the practical setup for this deployment. Datadog direct intake accepts HTTP/protobuf, not gRPC. The application also enables delta temporality for metrics sent over HTTP because Datadog rejects cumulative OTLP metrics.

Find the OTLP endpoint for your Datadog site in Datadog's [serverless OTLP intake documentation](https://docs.datadoghq.com/opentelemetry/setup/otlp_ingest/serverless/). For the US1 site, the common endpoint is `https://otlp.datadoghq.com`. Configure each Cloud Run service with:

```shell
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.datadoghq.com
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_HEADERS=dd-api-key=<api-key>,dd-otlp-source=serverless,compute_stats=true
OTEL_SERVICE_VERSION=<deployed-git-sha>
OTEL_TRACES_SAMPLING_RATIO=1
```

Keep `OTEL_SERVICE_NAME` unset so the API, worker, and preview renderer retain their separate defaults. On Cloud Run, the GCP resource detector adds the project, region, service, revision, and instance attributes that Datadog uses for serverless identification.

Do not put the API key in a normal Cloud Run environment variable. Store the complete header value in Secret Manager. Terraform maps it to `OTEL_EXPORTER_OTLP_HEADERS` when `otel_exporter_otlp_endpoint` is set:

```shell
gcloud secrets create DATADOG_OTLP_HEADERS --replication-policy=automatic
printf '%s' 'dd-api-key=<api-key>,dd-otlp-source=serverless,compute_stats=true' \
  | gcloud secrets versions add DATADOG_OTLP_HEADERS --data-file=-
```

Set these Terraform variables and apply `infra/prod`:

```hcl
otel_exporter_otlp_endpoint = "https://otlp.datadoghq.com"
otel_service_version        = "<git-sha>"
otel_logs_exporter          = "otlp"
```

Terraform configures all three Cloud Run services and grants the runtime service account access to the secret. If Datadog already ingests Cloud Run stdout through its GCP integration, set `otel_logs_exporter = "none"` to avoid duplicate logs. Duplicate ingestion increases cost and makes trace correlation harder to inspect.

Production deploys apply `infra/prod` from `main`, so the workflow only forwards these values to Terraform. Add a repository variable named `DATADOG_OTLP_ENDPOINT` with your site endpoint; the deploy job passes it as `TF_VAR_otel_exporter_otlp_endpoint`. Set the `OTEL_LOGS_EXPORTER` repository variable to `none` only when the GCP integration already sends Cloud Run logs. The service version is always the deployed commit SHA. Leaving `DATADOG_OTLP_ENDPOINT` unset disables export on the next apply, because Terraform then drops the telemetry environment from every service.

### Check ingestion

Generate one API request and one presentation job after deployment. Then check each signal:

1. Open **APM > Trace Explorer**. Filter with `service:slidesage-api env:production`, then open a request trace. A generation trace should include `generation.job` and outbound HTTP client spans. Filter the worker and the renderer separately with `service:slidesage-worker` and `service:slidesage-preview`.
2. Open **Metrics > Explorer** and search for `http.server.request.duration`, `http.server.requests`, `generation.job.duration`, and `generation.tokens.used`. Datadog may normalize dots in OTLP metric names, so use the metric picker instead of typing a dashboard query before the first points arrive.
3. Open **Logs > Explorer** and filter with `service:slidesage-api`, `service:slidesage-worker`, or `service:slidesage-preview`. Open a log emitted during a request and use its trace link to confirm trace-log correlation.
4. Open **APM > Service Catalog** and confirm every service reports `env:production` and the current `version`.

Start a dashboard with request rate, error rate, p95 request duration, generation attempt outcomes, generation p95 duration, and token use. Build the first three widgets from APM trace metrics when possible. Use the custom OTLP metrics for generation-specific widgets.

If no data appears, check Cloud Run logs for exporter errors. A `403` usually means the API key or site-specific endpoint is wrong. A connection or protocol error usually means `OTEL_EXPORTER_OTLP_PROTOCOL` is still `grpc`. Datadog's Go trace intake may return `202 Accepted`; current OpenTelemetry Go exporters can log that response as an error even though Datadog accepted the trace.

## Lifecycle

`observability.Setup` installs global tracer, meter, and logger providers plus the W3C propagator and returns a handle whose `Shutdown` flushes all three signals. `cmd/api`, `cmd/worker`, and `cmd/previewworker` each defer this shutdown with a five second budget during graceful termination, so buffered telemetry is exported before exit.
