# Environment variables

Copy `.env.example` to `.env`. Devenv loads it for the Go API, generation worker, and Bun workspace processes.

## Core

| Variable                      | Required   | Default                                                                                                    | Purpose                                                                             |
| ----------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `AUTH_SECRET`                 | Production | Local-only development secret                                                                              | Signs JWTs; HTTPS deployments require at least 32 characters                        |
| `BASE_URL`                    | No         | `http://localhost:8000`                                                                                    | Public API and auth callback origin                                                 |
| `PORT`                        | No         | `8000`                                                                                                     | API listen port                                                                     |
| `HOST`                        | No         | `0.0.0.0`                                                                                                  | API listen host                                                                     |
| `DATABASE_URL`                | No locally | Local devenv database                                                                                      | PostgreSQL connection string                                                        |
| `DATABASE_CONNECT_TIMEOUT`    | No         | `10`                                                                                                       | PostgreSQL connection timeout in seconds                                            |
| `DATABASE_IDLE_TIMEOUT`       | No         | `20`                                                                                                       | PostgreSQL idle connection timeout in seconds                                       |
| `DATABASE_POOL_MAX`           | No         | `5`                                                                                                        | Maximum open and idle connections in the Go API pool                                |
| `RATE_LIMIT_HASH_SECRET`      | Production | `AUTH_SECRET`                                                                                              | Independent secret mixed into hashed rate-limit identities                          |
| `TRUST_PROXY_HEADERS`         | No         | `false`                                                                                                    | Allows Go to use proxy-supplied client-IP headers; enable only behind a proxy that replaces them |
| `CORS_ORIGINS`                | No         | Local Bun origins, `https://slidesage.pages.dev`, `https://slidesage.app`, and `https://www.slidesage.app` | Comma-separated allowed web origins; trailing slashes are normalized                |
| `CORS_ORIGIN`                 | No         | Default CORS origins                                                                                       | Single-origin fallback; trailing slashes are normalized                             |
| `BETTER_AUTH_TRUSTED_ORIGINS` | No         | Local frontend, `https://slidesage.pages.dev`, `https://slidesage.app`, and `https://www.slidesage.app`    | Comma-separated auth callback origins; trailing slashes are normalized              |
| `VITE_API_URL`                | No         | `http://localhost:8000`                                                                                    | Browser API origin without a path suffix; set production to `https://api.slidesage.app` |
| `PRESENTATION_GCS_BUCKET`      | Canonical PPTX revisions | None | Private GCS bucket configuration for the canonical revision flow |
| `NODE_ENV`                    | No         | `development` in devenv                                                                                    | Controls production auth and email-delivery safeguards; OTP values are never logged |

Devenv also supplies `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `POSTGRES_PORT` for its local PostgreSQL process. Their defaults are all `slidesage`, except `POSTGRES_PORT=5432`. The running PostgreSQL process exposes its active port as `PGPORT`.

Devenv may select another PostgreSQL port when the default is occupied. Its migration task constructs `DATABASE_URL` from the active `PGPORT`, so values loaded from `.env` cannot redirect migrations to a stale local port. The managed API process uses the same active-port connection string and does not reload `.env`, preventing its development command from reverting to the default port.

The Go API uses one bounded `database/sql` pool configured by `DATABASE_POOL_MAX`, `DATABASE_CONNECT_TIMEOUT`, and `DATABASE_IDLE_TIMEOUT`.

| Variable                  | Required | Default | Purpose                                                      |
| ------------------------- | -------- | ------- | ------------------------------------------------------------ |
| `GENERATION_STREAM_LIMIT` | No       | `40`    | Maximum concurrent generation SSE streams in one API process |
| `GENERATION_STREAM_LIMIT_PER_USER` | No       | `3`     | Maximum concurrent generation SSE streams for one user in one API process |

Set `RATE_LIMIT_HASH_SECRET` to a separate random deployment secret. Falling back to `AUTH_SECRET` is supported, but an independent value avoids coupling rate-limit identity hashes to auth-secret rotation. See [RATE_LIMITING.md](RATE_LIMITING.md).

## Generation worker

| Variable               | Required | Default | Purpose                                                          |
| ---------------------- | -------- | ------- | ---------------------------------------------------------------- |
| `WORKER_CONCURRENCY`   | No       | `2`     | Maximum concurrent River generation jobs in one worker process   |
| `WORKER_DATABASE_POOL_MAX` | No       | `WORKER_CONCURRENCY + 3` | Maximum open and idle connections in the worker database pool    |
| `WORKER_DRAIN_TIMEOUT` | No       | `8`     | Graceful shutdown timeout in seconds after `SIGINT` or `SIGTERM` |
| `WORKER_HEALTH_PORT`   | No       | `8080`  | Worker `/live` and `/ready` health server port                   |

The worker also requires `DATABASE_URL` and uses `DATABASE_CONNECT_TIMEOUT` and `DATABASE_IDLE_TIMEOUT`. It must receive the same generation provider and BYOK encryption configuration as the API because provider execution occurs in `cmd/worker`, not in the submission request.

`GET /live` returns `204` while the worker health server is running. `GET /ready` returns `204` only when the worker accepts work and PostgreSQL is reachable. It returns `503` during draining. The health server is for platform probes; application coordination between the API and worker occurs through PostgreSQL.

For Cloud Run Worker Pools, start with one instance and change the fixed/manual instance count deliberately. Account for both the instance count and `WORKER_CONCURRENCY` when sizing PostgreSQL connection limits and provider capacity. See [GENERATION_WORKER.md](GENERATION_WORKER.md). When deployed as a Cloud Run service rather than a Worker Pool, the worker must use instance-based billing with CPU throttling disabled so River and maintenance continue between HTTP requests.

## Preview renderer

| Variable                    | Required | Default                    | Purpose                                                              |
| --------------------------- | -------- | -------------------------- | -------------------------------------------------------------------- |
| `PREVIEW_CONCURRENCY`       | No       | `1`                        | Maximum concurrent River preview jobs in one renderer process        |
| `PREVIEW_DATABASE_POOL_MAX` | No       | `PREVIEW_CONCURRENCY + 2`  | Maximum open and idle connections in the renderer database pool      |
| `PREVIEW_DRAIN_TIMEOUT`     | No       | `8`                        | Graceful shutdown timeout in seconds after `SIGINT` or `SIGTERM`     |
| `PREVIEW_HEALTH_PORT`       | No       | `8080`                     | Renderer `/live` and `/ready` health server port                     |
| `PREVIEW_MAX_SLIDES`        | No       | `200`                      | Slide ceiling for one render                                         |
| `PREVIEW_WIDTH`             | No       | `1600`                     | Rasterized preview width in pixels                                   |
| `PREVIEW_TIMEOUT_SECONDS`   | No       | `240`                      | Wall-clock budget for one deck conversion                            |
| `PREVIEW_WEBP_QUALITY`      | No       | `82`                       | `cwebp` quality factor                                               |
| `PREVIEW_TEMP_DIR`          | No       | Operating system temporary directory | Parent directory for per-render working directories        |
| `SOFFICE_PATH`              | No       | `soffice`                  | LibreOffice executable                                               |
| `PDFTOPPM_PATH`             | No       | `pdftoppm`                 | poppler rasterizer executable                                        |
| `CWEBP_PATH`                | No       | `cwebp`                    | WebP encoder executable                                              |

The renderer also requires `DATABASE_URL` and `PRESENTATION_GCS_BUCKET`. It reads revisions and writes preview images with the attached service account. See [SLIDE_PREVIEWS.md](SLIDE_PREVIEWS.md).

## Office editor

The browser editor is not part of this build. No API process reads any `ONLYOFFICE_*` or `EDITOR_*`
variable, because the document server is not provisioned and the integration has been moved to the
`onlyoffice-editor` bookmark. The variables and their documentation live there, and come back with
it.

## AI and research

| Variable                        | Required                                  | Default                              | Purpose                                                                                                                                    |
| ------------------------------- | ----------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPEN_ROUTER_API_KEY`           | Yes for default generation                | None                                 | Server OpenRouter authentication; BYOK replaces only generation calls                                                                      |
| `OPEN_ROUTER_MODEL`             | No                                        | `openrouter/free`                     | Generation model; OpenRouter selects an available free model for each request                                                                |
| `OPEN_ROUTER_API_BASE`          | No                                        | OpenRouter chat completions endpoint | Chat endpoint override                                                                                                                     |
| `OPEN_ROUTER_MAX_OUTPUT_TOKENS` | No                                        | Not used                             | Generation enforces a server-owned 2,000-16,000 output-token ceiling based on requested slide count so point authorizations remain bounded |
| `PROVIDER_VALIDATION_TIMEOUT_MS` | No                                        | `15000`                              | Total timeout for listing models from a user-connected BYOK provider                                                                       |
| `EXA_API_KEY`                   | For web research                          | None                                 | Exa search authentication                                                                                                                  |
| `EXA_REQUEST_TIMEOUT_MS`        | No                                        | `10000`                              | Maximum Exa request duration; caller cancellation can stop it earlier                                                                      |
Presentation requests without a valid user provider connection use OpenRouter JSON output and consume SlideSage points. The default `openrouter/free` router selects an available free model for each request, improving availability at the cost of less predictable model behavior. Set `OPEN_ROUTER_MODEL` explicitly when a pinned model is required. Valid BYOK connections replace this generation path.

## Authentication and email

| Variable                    | Required         | Default | Purpose                                        |
| --------------------------- | ---------------- | ------- | ---------------------------------------------- |
| `RESEND_API_KEY`            | Production email | None    | Sends verification and password-reset OTPs     |
| `RESEND_FROM_EMAIL`         | No               | `onboarding@resend.dev` | Sender address on a Resend-verified domain; prefer plain `email@example.com` syntax because some dotenv loaders preserve quotes |
| `EMAIL_DELIVERY_TIMEOUT_MS` | No               | `10000` | Maximum wait for Resend to accept an OTP email |
| `GOOGLE_CLIENT_ID`          | For Google OAuth | None    | Google OAuth client ID                         |
| `GOOGLE_CLIENT_SECRET`      | For Google OAuth | None    | Google OAuth client secret                     |
| `GITHUB_CLIENT_ID`          | For GitHub OAuth | None    | GitHub OAuth client ID                         |
| `GITHUB_CLIENT_SECRET`      | For GitHub OAuth | None    | GitHub OAuth client secret                     |

Without `RESEND_API_KEY`, development mode skips delivery and logs a warning but never logs the OTP. Production send requests fail with `503` when the key is missing or Resend rejects the request. OAuth callback URLs are `${BASE_URL}/auth/callback/google` and `${BASE_URL}/auth/callback/github`.

When `BASE_URL` is unset in a deployment, auth can derive it from the platform-provided `CF_PAGES_URL` or `VERCEL_URL`.

## Billing

| Variable                  | Required      | Default | Purpose                                                         |
| ------------------------- | ------------- | ------- | --------------------------------------------------------------- |
| `RAZORPAY_KEY_ID`         | Yes           | None    | Public checkout key                                             |
| `RAZORPAY_KEY_SECRET`     | Yes           | None    | Creates orders and verifies payments                            |
| `RAZORPAY_WEBHOOK_SECRET` | Yes           | None    | Verifies signatures against the exact raw Razorpay webhook body |
| `RAZORPAY_REQUEST_TIMEOUT_MS` | No            | `15000` | Maximum Razorpay API request duration                           |

The API reads all three credentials at startup and exits when any of them is empty, so it cannot run without payments configured. `.env.example` ships placeholder values that satisfy the check for local development.

Do not commit `.env`. Keep secrets in the deployment platform's secret store in production.

Set `VITE_API_URL=https://api.slidesage.app` for the `slidesage.app` production build. The client sends requests directly to each endpoint. As a deployment safeguard, production builds ignore loopback values such as `localhost` and `127.0.0.1` and fall back to same-origin routes instead.

## GCS and Cloud CDN

| Variable                     | Required | Secret | Purpose |
| ---------------------------- | -------- | ------ | ------- |
| `PRESENTATION_GCS_BUCKET`    | Canonical revisions | No | Private bucket receiving create-only canonical PPTX objects |
| `CDN_URL`                    | Signed template delivery | No | HTTPS origin used when signing template URLs; templates are served by the API load balancer under `/pptx-templates/` |
| `CDN_SIGNING_KEY_NAME`       | Signed template delivery | No | Active Cloud CDN signing-key identifier sent as `KeyName` |
| `CDN_SIGNING_KEY_SECRET`     | Signed template delivery | Yes | Base64url-encoded 128-bit shared key used by the server-side signer |
| `CDN_SIGNED_URL_TTL_SECONDS` | No | No | Signed template URL lifetime; defaults to `900` seconds |

Set `CDN_URL` to the API load balancer host, `https://api.slidesage.app`. Only that host rule routes `/pptx-templates/*` to the template backend bucket; any other subdomain is unrouted. Development processes use the same production origin, because signing happens on the server and a process on `localhost` mints valid URLs with the same key. The API reads these variables once at startup: with none of them set it logs that template thumbnails are disabled and skips the route, and with a partial or malformed set it exits.

`CDN_SIGNED_URL_TTL_SECONDS` applies to both consumers of the signer, the generation template fetch and the marketplace thumbnail route.

`CDN_SIGNING_KEY_NAME` is only an identifier and cannot create a valid signed URL by itself. The signer must retain the corresponding 16-byte secret because Google does not return key values through its APIs after configuration. Keep `CDN_SIGNING_KEY_SECRET` in Secret Manager and never expose it through a `VITE_` variable. See Google's [Cloud CDN signed URL documentation](https://cloud.google.com/cdn/docs/using-signed-urls#createkeys).

When the canonical revision flow is wired into Cloud Run, it will use the attached service account through Application Default Credentials; do not deploy a service-account JSON key. Grant the runtime account bucket-scoped `roles/storage.objectCreator` and `roles/storage.objectViewer` for the private revision bucket. The GCS adapter uses the `DoesNotExist` generation precondition so retries cannot overwrite an object. See Google's [generation preconditions](https://cloud.google.com/storage/docs/request-preconditions#special-match) and [Cloud Storage IAM roles](https://cloud.google.com/storage/docs/access-control/iam-roles#storage.objectCreator).

The API refuses to initialize authentication on an HTTPS base URL without a sufficiently strong `AUTH_SECRET`.

## Observability

| Variable                       | Required | Default                                            | Purpose                                                                                     |
| ------------------------------ | -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`  | No       | Empty                                              | Common OTLP endpoint; telemetry export stays disabled while empty                           |
| `OTEL_EXPORTER_OTLP_PROTOCOL`  | No       | `grpc`                                             | `grpc` for a collector or `http/protobuf` for an HTTP intake such as Datadog direct intake   |
| `OTEL_EXPORTER_OTLP_HEADERS`   | No       | Empty                                              | Comma-separated OTLP request headers; treat the value as a secret when it contains an API key |
| `OTEL_EXPORTER_OTLP_INSECURE`  | No       | `false`                                            | Plaintext gRPC for collectors without TLS, such as local development                        |
| `OTEL_SERVICE_NAME`            | No       | `slidesage-api`, `-worker`, or `-preview`          | Resource service name on all signals                                                        |
| `OTEL_SERVICE_VERSION`         | No       | Empty                                              | Resource service version                                                                    |
| `OTEL_RESOURCE_ENVIRONMENT`    | No       | `ENVIRONMENT`, then `NODE_ENV`, then `development` | Deployment environment label                                                                |
| `OTEL_RESOURCE_ATTRIBUTES`     | No       | Empty                                              | Extra comma-separated OpenTelemetry resource attributes                                     |
| `OTEL_TRACES_EXPORTER`         | No       | `otlp`                                             | Set to `none` to disable trace export                                                        |
| `OTEL_METRICS_EXPORTER`        | No       | `otlp`                                             | Set to `none` to disable metric export                                                       |
| `OTEL_LOGS_EXPORTER`           | No       | `otlp`                                             | Set to `none` to disable OTLP logs, for example when another integration collects stdout     |
| `OTEL_TRACES_SAMPLING_RATIO`   | No       | `1`                                                | Head-sampling ratio for root spans between 0 and 1                                          |
| `OTEL_METRIC_EXPORT_INTERVAL`  | No       | `60000`                                            | Metric export interval in milliseconds                                                      |

Setting `OTEL_SDK_DISABLED=true` also disables export regardless of endpoint. See [OBSERVABILITY.md](OBSERVABILITY.md) for the emitted traces, metrics, and logs.

## BYOK credential encryption

| Variable                              | Required | Description                                           |
| ------------------------------------- | -------- | ----------------------------------------------------- |
| `BYOK_ENCRYPTION_KEY_CURRENT_VERSION` | For BYOK | Active encryption key version, normally `1` initially |
| `BYOK_ENCRYPTION_KEY`                 | For BYOK | Base64-encoded 32-byte AES-GCM key (active version `1`) |

Provider API keys are supplied by users and encrypted with these deployment secrets. They are used only for presentation generation.

`BYOK_ENCRYPTION_KEY_CURRENT_VERSION` is a non-secret version selector. The active version `1` key is read from `BYOK_ENCRYPTION_KEY`; rotated-out versions `n > 1` stay in `BYOK_ENCRYPTION_KEY_V<n>`. Every referenced key is secret and must remain available while stored credentials still use that version.
