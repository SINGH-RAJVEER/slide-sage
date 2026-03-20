# Environment Variables Reference

This document lists the environment variables used by Slide Sage and where each one is consumed.

## Scope

- `apps/APIs`: backend runtime (Hono + Better Auth + AI/RAG services)
- `apps/Web`: frontend build/runtime (Vite)
- `packages/DB`: shared DB client used by APIs
- `docker/*/docker-compose*.yml`: container orchestration and port/database wiring
- `litellm_config.yaml`: LiteLLM model provider config

## Application Runtime Variables

These variables are read directly by application code (`process.env.*` or `import.meta.env.*`).

| Variable | Required | Used By | Purpose | Default/Fallback |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Yes | `apps/APIs/drizzle.config.ts`, `packages/DB/src/db/index.ts` | PostgreSQL connection string for migrations and runtime DB access. | `postgresql://slidesage:slidesage@localhost:5432/slidesage` |
| `AUTH_SECRET` | Yes (prod) | `apps/APIs/src/services/auth.ts` | Better Auth signing/encryption secret. | `your-secret-key-change-in-production` |
| `CORS_ORIGINS` | Recommended | `apps/APIs/src/index.ts`, `apps/APIs/src/services/auth.ts` | Comma-separated allowlist for CORS and trusted auth origins. | `*` for API CORS middleware; Better Auth falls back to `http://localhost:5173` |
| `HOST` | Recommended | `apps/APIs/src/utils/api-url.ts` (via `apps/APIs/src/services/auth.ts` and `apps/APIs/src/routes/auth.routes.ts`) | Host used to build backend auth callback/sign-in URLs. | Normalized to `localhost` when unset or wildcard host values are used |
| `PORT` | Recommended | `apps/APIs/src/index.ts`, `apps/APIs/src/utils/api-url.ts` | API server port and API base URL construction. | `8000` |
| `GOOGLE_CLIENT_ID` | Optional (needed for Google OAuth) | `apps/APIs/src/services/auth.ts` | Google OAuth client ID. | Empty string |
| `GOOGLE_CLIENT_SECRET` | Optional (needed for Google OAuth) | `apps/APIs/src/services/auth.ts` | Google OAuth client secret. | Empty string |
| `GITHUB_CLIENT_ID` | Optional (needed for GitHub OAuth) | `apps/APIs/src/services/auth.ts` | GitHub OAuth client ID. | Empty string |
| `GITHUB_CLIENT_SECRET` | Optional (needed for GitHub OAuth) | `apps/APIs/src/services/auth.ts` | GitHub OAuth client secret. | Empty string |
| `RESEND_API_KEY` | Optional (needed for email sending) | `apps/APIs/src/services/email.service.ts` | Resend API key for verification/auth emails. | If unset, email sending is disabled/logged |
| `RESEND_FROM_EMAIL` | Optional | `apps/APIs/src/services/email.service.ts` | Sender address for outbound emails. | `onboarding@resend.dev` |
| `ADMIN_SECRET_HASH` | Optional (script-only) | `apps/APIs/src/scripts/manage.ts` | Secret hash used by management script access checks. | None |
| `LITELLM_MODEL` | Recommended | `apps/APIs/src/services/ai.service.ts` | Primary model for slide generation and iteration. | `groq/llama3-8b-8192` |
| `LITELLM_SEARCH_MODEL` | Recommended | `apps/APIs/src/services/search.service.ts` | Model used for research/source summarization flows. | `llama-3.1-8b-instant` |
| `LITELLM_PROXY_BASE` | Recommended | `apps/APIs/src/services/ai.service.ts`, `apps/APIs/src/services/rag.service.ts`, `apps/APIs/src/scripts/test-rag.ts` | Base URL for LiteLLM proxy (chat/embeddings endpoints are derived from this). | `http://localhost:4000` |
| `LITELLM_PROXY_URL` | Optional | `apps/APIs/src/services/ai.service.ts` | Explicit full URL override for chat completions proxy endpoint. | Derived from `LITELLM_PROXY_BASE` |
| `LITELLM_PROXY_KEY` | Optional | `apps/APIs/src/services/ai.service.ts` | Bearer token for protected LiteLLM proxy (chat). | Falls back to `LITELLM_API_KEY` |
| `LITELLM_API_BASE` | Optional | `apps/APIs/src/services/ai.service.ts` | Direct provider OpenAI-compatible completions endpoint override. | Provider default endpoints by model prefix |
| `LITELLM_API_KEY` | Optional/Contextual | `apps/APIs/src/services/ai.service.ts`, `apps/APIs/src/services/rag.service.ts` | API key used for direct provider calls and optional LiteLLM auth. | Falls back to provider-specific keys in AI service |
| `GROQ_API_KEY` | Required for Groq paths | `apps/APIs/src/services/ai.service.ts`, `apps/APIs/src/services/search.service.ts`, `litellm_config.yaml` | Groq provider key for direct calls and LiteLLM model routing. | None |
| `GEMINI_API_KEY` | Required for Gemini paths | `apps/APIs/src/services/ai.service.ts`, `litellm_config.yaml` | Gemini provider key for direct calls and embeddings/model routing. | None |
| `OPENAI_API_KEY` | Optional | `apps/APIs/src/services/ai.service.ts` | OpenAI provider key for direct model calls when using OpenAI-prefixed/default models. | None |
| `EMBEDDING_MODEL` | Recommended | `apps/APIs/src/services/rag.service.ts`, `apps/APIs/src/scripts/test-rag.ts` | Embedding model name used by RAG embedding generation. | `gemini/text-embedding-004` |
| `BRAVE_SEARCH_API_KEY` | Optional (needed for web research mode) | `apps/APIs/src/services/search.service.ts` | Brave Search API token for external source retrieval. | If unset, web search is skipped |
| `VITE_API_URL` | Recommended | `apps/Web/vite.config.ts`, `apps/Web/src/routes/HomePage.tsx`, `apps/Web/src/modules/contexts/StreamingContext.tsx`, `apps/Web/src/modules/pages/GenerateResearchPage.tsx`, `apps/Web/src/modules/pages/PresentationsGridPage.tsx`, `apps/Web/src/modules/pages/PurchaseTokensPage.tsx`, `apps/Web/src/components/Viewer/PresentationViewerPage.tsx` | Browser-facing base URL used by frontend API requests. | Vite config fallback: `http://localhost:8000` |

## Docker Compose Variables

These are referenced in compose templates (`${VAR}`) to parameterize container wiring.

| Variable | Used In | Purpose | Default/Fallback |
| --- | --- | --- | --- |
| `GROQ_API_KEY` | `docker/dev/docker-compose.dev.yml`, `docker/prod/docker-compose.prod.yml` | Passed into LiteLLM container for Groq-backed routes. | None |
| `GEMINI_API_KEY` | `docker/dev/docker-compose.dev.yml`, `docker/prod/docker-compose.prod.yml` | Passed into LiteLLM container for Gemini-backed routes. | Empty when omitted |
| `OPENAI_API_KEY` | `docker/dev/docker-compose.dev.yml`, `docker/prod/docker-compose.prod.yml` | Passed into LiteLLM container for OpenAI-backed routes. | Empty when omitted |
| `POSTGRES_USER` | `docker/dev/docker-compose.dev.yml`, `docker/prod/docker-compose.prod.yml` | PostgreSQL username and API DB URL interpolation. | `slidesage` |
| `POSTGRES_PASSWORD` | `docker/dev/docker-compose.dev.yml`, `docker/prod/docker-compose.prod.yml` | PostgreSQL password and API DB URL interpolation. | `slidesage` |
| `POSTGRES_DB` | `docker/dev/docker-compose.dev.yml`, `docker/prod/docker-compose.prod.yml` | PostgreSQL database name and API DB URL interpolation. | `slidesage` |
| `POSTGRES_PORT` | `docker/dev/docker-compose.dev.yml` | Host port mapping for local Postgres access in dev. | `5432` |
| `APIS_PORT` | `docker/dev/docker-compose.dev.yml` | Host port mapping for APIs container in dev. | `8000` |
| `WEB_PORT` | `docker/dev/docker-compose.dev.yml` | Host port mapping for Web container in dev. | `5173` |
| `LITELLM_SEARCH_MODEL` | `docker/dev/docker-compose.dev.yml`, `docker/prod/docker-compose.prod.yml` | Default search summarization model injected into APIs container. | `llama-3.1-8b-instant` |
| `VITE_API_URL` | `docker/prod/docker-compose.prod.yml` | Frontend API base URL build/runtime value in production compose. | `/api` |
| `NGINX_HTTP_PORT` | `docker/prod/docker-compose.prod.yml` | Host HTTP port mapping for nginx. | `80` |
| `NGINX_HTTPS_PORT` | `docker/prod/docker-compose.prod.yml` | Host HTTPS port mapping for nginx. | `443` |

## Notes

- Some variables are optional because the feature path itself is optional (for example OAuth, web research, or specific model providers).
- Several variables have secure-looking development defaults in code; treat those defaults as local-only and always override in production.
- If both direct-provider and LiteLLM proxy paths are enabled, the AI service resolves keys/endpoints based on selected model prefix and available envs.
