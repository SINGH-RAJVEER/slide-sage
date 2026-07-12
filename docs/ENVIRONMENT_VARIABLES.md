# Environment Variables

Copy `.env.example` to `.env`. Devenv loads the root file, and the API also loads
it directly when run outside the devenv process group.

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
| `VITE_API_URL` | No | `http://localhost:5173` in devenv | Browser API base; production uses `https://slidesage.app` with `/api/*` routed to the Worker, while the local value uses Vite's proxy |
| `VITE_PROXY_TARGET` | No | `http://localhost:8000` | Vite API proxy target |
| `NODE_ENV` | No | `development` in devenv | Enables development-only behavior such as logging unsent OTPs |

Devenv also supplies `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and
`POSTGRES_PORT` for its local PostgreSQL process. Their defaults are all
`slidesage`, except `POSTGRES_PORT=5432`.

## AI and Research

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `OPEN_ROUTER_API_KEY` | Yes for generation | None | OpenRouter authentication |
| `OPEN_ROUTER_MODEL` | No | `google/gemma-4-26b-a4b-it:free` | Generation model |
| `OPEN_ROUTER_SEARCH_MODEL` | No | `OPEN_ROUTER_MODEL` | Research summarization model |
| `OPEN_ROUTER_API_BASE` | No | OpenRouter chat completions endpoint | Chat endpoint override |
| `OPEN_ROUTER_EMBEDDINGS_URL` | No | OpenRouter embeddings endpoint | Embedding endpoint override |
| `EMBEDDING_MODEL` | No | Value in `services/rag/defaults.ts` | Semantic-memory embedding model |
| `EXA_API_KEY` | For web research | None | Exa search authentication |

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

For the Cloudflare Worker, configure `AUTH_SECRET`, `DATABASE_URL`, and other
sensitive values with `wrangler secret put`. Keep `BASE_URL` and trusted origins
as Worker variables or secrets appropriate to the environment. The API refuses
to initialize authentication on an HTTPS base URL without a sufficiently strong
`AUTH_SECRET`.
