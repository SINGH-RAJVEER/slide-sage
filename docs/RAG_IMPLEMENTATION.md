# Research Context

The Go API supports web research as an explicit generation input. It does not
perform semantic-memory retrieval or maintain a separate RAG pipeline.

## Research Flow

1. The API validates the research request and calls Exa.
2. The web application displays returned sources for review.
3. The user proceeds with the reviewed source payload.
4. The Go generation route includes those sources in the provider prompt.
5. The resulting presentation stores the reviewed sources for attribution.

Research requests use `EXA_API_KEY` and `EXA_REQUEST_TIMEOUT_MS`. Generation uses
the server OpenRouter embedding configuration only where the active generation
path requires it; user BYOK credentials are used for generation calls, not server
research configuration.

## Schema Changes

Go API schema changes belong in `apps/api/migrations` and are managed by Goose:

```bash
just db-generate describe_schema_change
just migrate
```

Do not apply schema changes through an ORM or an ad hoc database push.

## Verification

```bash
just test-api
just test-web
```
