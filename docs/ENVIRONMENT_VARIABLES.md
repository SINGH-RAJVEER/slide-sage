# Environment Variables

Copy `.env.example` to `.env`. API development script passes it to Bun with `--env-file` when run outside the devenv process group.

## Core

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `AUTH_SECRET` | Production | Local-only development secret | Signs Better Auth state; HTTPS deployments require at least 32 characters |
| `BASE_URL` | No | `http://localhost:8000` | Public API and auth callback origin |
| `PORT` | No | `8000` | API listen port |
| `DATABASE_URL` | No locally | Local devenv database | PostgreSQL connection string |
| `DATABASE_CONNECT_TIMEOUT` | No | Driver default | PostgreSQL connection timeout |
| `CORS_ORIGINS` | No | Local Vite origins, `https://slide-sage.pages.dev`, and `https://slidesage.app` | Comma-separated allowed web origins; trailing slashes are normalized |
| `CORS_ORIGIN` | No | Default CORS origins | Single-origin fallback; trailing slashes are normalized |
| `BETTER_AUTH_TRUSTED_ORIGINS` | No | Local frontend, `https://slide-sage.pages.dev`, and `https://slidesage.app` | Comma-separated auth callback origins; trailing slashes are normalized |
| `VITE_API_URL` | No | `http://localhost:5173` in devenv | Browser API base; production uses same-origin `/api/*` routes, while the local value uses Vite's proxy |
| `VITE_PROXY_TARGET` | No | `http://localhost:8000` | Vite API proxy target |
| `NODE_ENV` | No | `development` in devenv | Enables development-only behavior such as logging unsent OTPs |

Devenv also supplies `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and
`POSTGRES_PORT` for its local PostgreSQL process. Their defaults are all
`slidesage`, except `POSTGRES_PORT=5432`.

Devenv may select another PostgreSQL port when the default is occupied. Its migration
task constructs `DATABASE_URL` from the active `POSTGRES_PORT`, so values loaded from
`.env` cannot redirect migrations to a stale local port.
The managed API process uses the same active-port connection string and does not
reload `.env`, preventing its development command from reverting to the default port.

## AI and Research

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPEN_ROUTER_API_KEY` | Yes for generation | None | OpenRouter authentication |
| `OPEN_ROUTER_MODEL` | No | `google/gemma-4-26b-a4b-it` | Generation model; the default is a paid OpenRouter endpoint for production reliability |
| `OPEN_ROUTER_API_BASE` | No | OpenRouter chat completions endpoint | Chat endpoint override |
| `OPEN_ROUTER_EMBEDDINGS_URL` | No | OpenRouter embeddings endpoint | Embedding endpoint override |
| `OPEN_ROUTER_MAX_ATTEMPTS` | No | `3` | Maximum full generation attempts for transient, interrupted, or invalid responses |
| `OPEN_ROUTER_REQUEST_TIMEOUT_MS` | No | `180000` | Maximum wait for OpenRouter to return response headers per attempt |
| `OPEN_ROUTER_STREAM_IDLE_TIMEOUT_MS` | No | `120000` | Maximum silence between OpenRouter stream chunks before retrying |
| `OPEN_ROUTER_RETRY_BASE_DELAY_MS` | No | `1000` | Initial retry backoff delay |
| `OPEN_ROUTER_RETRY_MAX_DELAY_MS` | No | `30000` | Maximum retry delay, including provider `Retry-After` values |
| `OPEN_ROUTER_MAX_RESPONSE_BYTES` | No | `8388608` | Maximum streamed response size accepted per attempt |
| `OPEN_ROUTER_MAX_OUTPUT_TOKENS` | No | `32768` | Maximum output-token budget; generation scales the request up to this limit based on slide count |
| `SSE_KEEPALIVE_INTERVAL_MS` | No | `10000` | Interval for downstream SSE keepalive comments during slow generation |
| `EMBEDDING_MODEL` | No | Value in `services/rag/defaults.ts` | Semantic-memory embedding model |
| `EXA_API_KEY` | For web research | None | Exa search authentication |

Presentation requests use OpenRouter strict JSON Schema output and require a provider that supports the requested parameters. OpenRouter provider fallback remains enabled so transient provider outages can route to another compatible endpoint. The default model incurs OpenRouter usage charges; set `OPEN_ROUTER_MODEL` explicitly if a different cost or availability profile is required.

## Authentication and Email

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Production email | Sends verification and password-reset OTPs |
| `RESEND_FROM_EMAIL` | No | Sender address; defaults to `onboarding@resend.dev` |
| `GOOGLE_CLIENT_ID` | For Google OAuth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Google OAuth | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | For GitHub OAuth | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | For GitHub OAuth | GitHub OAuth client secret |

Without `RESEND_API_KEY`, development mode logs OTPs instead of sending email.
OAuth callback URLs are `${BASE_URL}/api/auth/callback/google` and
`${BASE_URL}/api/auth/callback/github`.

When `BASE_URL` is unset in a deployment, auth can derive it from the
platform-provided `CF_PAGES_URL` or `VERCEL_URL`.

## Billing

| Variable | Required | Purpose |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` | For purchases | Public checkout key |
| `RAZORPAY_KEY_SECRET` | For purchases | Creates orders and verifies payments |
| `RAZORPAY_WEBHOOK_SECRET` | For webhooks | Verifies Razorpay webhook signatures |

Do not commit `.env`. Keep secrets in the deployment platform's secret store in
production.

Leave `VITE_API_URL` unset for the `slidesage.app` production build so browser
requests use same-origin `/api/*` routes. As a deployment safeguard, production
builds ignore loopback values such as `localhost` and `127.0.0.1` and fall back
to same-origin routes instead.

For the Cloudflare Worker, configure `AUTH_SECRET`, `DATABASE_URL`, and other
sensitive values with `wrangler secret put`. Keep `BASE_URL` and trusted origins
as Worker variables or secrets appropriate to the environment. The API refuses
to initialize authentication on an HTTPS base URL without a sufficiently strong
`AUTH_SECRET`.
