# Web research

Web research is an optional input to generation. The API does not run a separate retrieval or memory system.

## Research flow

1. The API validates the research request and calls Exa.
2. The web application displays returned sources for review.
3. The user proceeds with the reviewed source payload.
4. The Go generation route includes those sources in the provider prompt.
5. The resulting presentation stores the reviewed sources for attribution.

Research requests use `EXA_API_KEY` and `EXA_REQUEST_TIMEOUT_MS`. The API stores reviewed source records with the presentation. User BYOK keys are used for generation only, never for research or embeddings.

## Schema changes

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
