# BYOK Provider Connections

SlideSage supports direct presentation generation through user-owned OpenAI,
Google Gemini, and Anthropic API keys.

## Eligibility

Users must have strictly more than 50 SlideSage points to connect or replace a
key or change the selected model. Existing connections remain visible, usable,
and removable below this threshold.

Direct model usage is billed by the selected provider and does not consume
SlideSage generation points. Each successful SlideSage web research request still
costs one point, while OpenRouter embedding work continues
to use SlideSage infrastructure without receiving the user's provider key.

## Credential Handling

Provider keys are submitted to the authenticated API, validated against the
provider's official model-list endpoint, and encrypted using AES-256-GCM before
being stored. The encryption uses a random IV and authenticated user/provider
metadata. Plaintext keys are never returned to the browser.

Model choices are not maintained as a static SlideSage catalog. The API lists
models with the connected key when settings or selection validates availability.
Generation uses the previously validated encrypted selection without a second
catalog round trip. OpenAI uses `GET /v1/models`; Google uses the paginated
Gemini `GET /v1beta/models` API and keeps models that advertise
`generateContent`; Anthropic uses the paginated `GET /v1/models` API and keeps
models that advertise structured-output support. OpenAI's list response has no
capability metadata, so SlideSage keeps returned structured-output-capable GPT
and o-series families, including matching fine-tuned models, while excluding old
GPT families and returned audio, realtime, transcription, embedding, moderation,
image, search, and computer-use variants. Provider display names and descriptions
are used when available.

The API follows provider pagination, deduplicates model IDs, rejects control
characters and IDs too large for persisted preferences, limits catalog pages and
response sizes, and applies one timeout across the complete listing operation.
The first compatible model in the provider's ordering becomes the default when a
saved selection is missing or no longer listed. A selection is checked against a
fresh provider response before it is saved or used for generation.

Catalog refresh failures are isolated per provider so the settings page remains
usable for replacing or deleting a key. A definitive key rejection or loss of all
compatible models marks that connection invalid and restores point-funded
OpenRouter when no other valid connection remains. A transient provider failure
keeps the connection and saved selection intact and displays a provider-local
warning for retry.

Keys are trimmed, must contain 8 through 512 characters, and cannot contain a
newline or null byte. Validation receives the caller's cancellation signal and
has a 15-second default timeout, configurable with
`PROVIDER_VALIDATION_TIMEOUT_MS`. Provider `401` or `403` responses become a
sanitized `403 PROVIDER_KEY_REJECTED`; an account with no supported
generation model receives `422 PROVIDER_NO_COMPATIBLE_MODELS`; provider
unavailability receives `502 PROVIDER_VALIDATION_UNAVAILABLE`. Raw provider
responses and submitted credentials are not logged or returned.

Configure a base64-encoded 32-byte key:

```text
BYOK_ENCRYPTION_KEY_CURRENT_VERSION=1
BYOK_ENCRYPTION_KEY=<base64 key>
```

Keep old versioned keys available while rotating stored credentials.
`BYOK_ENCRYPTION_KEY_CURRENT_VERSION` is a non-secret selector. The
`BYOK_ENCRYPTION_KEY` value (and any rotated `BYOK_ENCRYPTION_KEY_V<n>` values)
are secrets; `secretspec.toml` includes the initial `BYOK_ENCRYPTION_KEY` entry
without treating the version selector as a secret.

## Routing

API keys and the default model are managed on the protected `/settings` page,
available from the account dropdown. Generation and iteration use point-funded
SlideSage OpenRouter while no valid provider connection exists. Connecting the
first key selects the first compatible model returned by that provider and
switches subsequent requests to BYOK.
Removing the final valid connection restores OpenRouter automatically. When one
or more connections exist, SlideSage uses the saved provider and never silently
falls back to another direct provider.

The settings page loads its configuration from `GET /ai/config`. Production
releases that add or change these endpoints must deploy the Go API as well as
the web application; an unauthenticated request to this route should return `401`,
not a service-wide `404` response.

Creating a connection returns `201`. Replacing one returns `200`, and deleting
one returns `204 No Content` with an empty body. Connection creation/replacement
and selection/deletion use separate per-user rate-limit scopes. See
[RATE_LIMITING.md](RATE_LIMITING.md) for exact windows and the PostgreSQL
deployment requirement.

Apply committed database migrations before deploying the Go API. BYOK requires
`00010_add_ai_provider_connections.sql` and the production
`BYOK_ENCRYPTION_KEY_CURRENT_VERSION` and versioned encryption-key secrets.

Research uses Exa. Source, presentation, and retrieval embeddings always use
the server-owned OpenRouter embedding configuration and never a user BYOK key.
