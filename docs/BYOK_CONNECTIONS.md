# BYOK Provider Connections

SlideSage supports direct presentation generation through user-owned OpenAI,
Google Gemini, and Anthropic API keys.

## Eligibility

Users must have strictly more than 50 SlideSage points to connect or replace a
key, select a model, generate, or iterate. Existing connections remain visible
and removable below this threshold.

Direct model usage is billed by the selected provider and does not consume
SlideSage points. Web research and OpenRouter embedding work continue to consume
the existing SlideSage point estimate.

## Credential Handling

Provider keys are submitted to the authenticated API, validated against the
provider's official model-list endpoint, and encrypted using AES-256-GCM before
being stored. The encryption uses a random IV and authenticated user/provider
metadata. Plaintext keys are never returned to the browser.

Configure a base64-encoded 32-byte key:

```text
BYOK_ENCRYPTION_KEY_CURRENT_VERSION=1
BYOK_ENCRYPTION_KEY_V1=<base64 key>
```

Keep old versioned keys available while rotating stored credentials.

## Routing

The model selector appears on the generation page after at least one provider
key validates successfully. Generation and iteration use the user's current
selected provider and model. SlideSage never silently falls back to another
provider.

Research uses Exa. Source, presentation, and retrieval embeddings always use
the server-owned OpenRouter embedding configuration and never a user BYOK key.
