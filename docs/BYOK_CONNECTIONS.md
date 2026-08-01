# BYOK Provider Connections

SlideSage supports direct presentation generation through user-owned OpenAI,
Google Gemini, and Anthropic API keys.

## Eligibility

Users must have strictly more than 50 SlideSage points to connect or replace a
key or change the selected model. Existing connections remain visible, usable,
and removable below this threshold.

Direct model usage is billed by the selected provider and does not consume
SlideSage generation points. Web research and OpenRouter embedding work continue
to use SlideSage infrastructure without receiving the user's provider key.

## Credential Handling

Provider keys are submitted to the authenticated API, validated against the
provider's official model-list endpoint, and encrypted using AES-256-GCM before
being stored. The encryption uses a random IV and authenticated user/provider
metadata. Plaintext keys are never returned to the browser.

Keys are trimmed, must contain 8 through 512 characters, and cannot contain a
newline or null byte. Validation receives the caller's cancellation signal and
has a 15-second default timeout. Provider `401` or `403` responses become a
sanitized `403 PROVIDER_KEY_REJECTED`; an account with no supported
structured-output model receives `422 PROVIDER_NO_COMPATIBLE_MODELS`; provider
unavailability receives `502 PROVIDER_VALIDATION_UNAVAILABLE`. Raw provider
responses and submitted credentials are not logged or returned.

Configure a base64-encoded 32-byte key:

```text
BYOK_ENCRYPTION_KEY_CURRENT_VERSION=1
BYOK_ENCRYPTION_KEY_V1=<base64 key>
```

Keep old versioned keys available while rotating stored credentials.
`BYOK_ENCRYPTION_KEY_CURRENT_VERSION` is a non-secret selector. The
`BYOK_ENCRYPTION_KEY_V<n>` values are secrets; `secretspec.toml` includes the
initial `BYOK_ENCRYPTION_KEY_V1` entry without treating the version selector as a
secret.

## Routing

API keys and the default model are managed on the protected `/settings` page,
available from the account dropdown. Generation and iteration use point-funded
SlideSage OpenRouter while no valid provider connection exists. Connecting the
first key selects a recommended model and switches subsequent requests to BYOK.
Removing the final valid connection restores OpenRouter automatically. When one
or more connections exist, SlideSage uses the saved provider and never silently
falls back to another direct provider.

The settings page loads its configuration from `GET /api/ai/config`. Production
releases that add or change these endpoints must deploy the API Worker as well as
the web application; an unauthenticated request to this route should return `401`,
not the Worker-wide `404` response.

Creating a connection returns `201`. Replacing one returns `200`, and deleting
one returns `204 No Content` with an empty body. Connection creation/replacement
and selection/deletion use separate per-user rate-limit scopes. See
[RATE_LIMITING.md](RATE_LIMITING.md) for exact windows and the PostgreSQL
deployment requirement.

Apply committed database migrations before deploying the Worker. BYOK requires
`0009_add_ai_provider_connections.sql` and the production
`BYOK_ENCRYPTION_KEY_CURRENT_VERSION` and versioned encryption-key secrets.

Research uses Exa. Source, presentation, and retrieval embeddings always use
the server-owned OpenRouter embedding configuration and never a user BYOK key.
