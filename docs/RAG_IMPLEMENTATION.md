# RAG and Semantic Memory

SlideSage stores embedding-backed context in PostgreSQL with pgvector and uses it
during generation and revision.

## Responsibilities

`apps/APIs/src/services/rag.service.ts` is the public service facade. Modules
under `services/rag/` separate retrieval, storage, seeding, defaults, types, and
utilities. Presentation and search services call this facade rather than writing
memory tables directly.

The system stores:

- Per-slide embeddings and summaries
- Deck-level intent and summary memory
- Retrieved source chunks
- Style and feedback memories
- Prompt events and successful example generations
- Reusable slide templates and semantic commands

All presentation-owned memories are deleted with their presentation.

## Generation

1. Embed the request with OpenRouter's embeddings endpoint.
2. Retrieve relevant memories and sources scoped to the user.
3. Add retrieved context to the generation prompt.
4. Stream the generated deck to the client.
5. Persist the deck, slides, prompt event, and derived memories.

Revision additionally stores feedback and retrieves the parent deck's context.
Web research stores source chunks so later generation can retrieve supporting
material.

## Configuration

```dotenv
OPEN_ROUTER_API_KEY=sk-...
OPEN_ROUTER_EMBEDDINGS_URL=https://openrouter.ai/api/v1/embeddings
EMBEDDING_MODEL=nvidia/llama-nemotron-embed-vl-1b-v2:free
```

Only the API key is mandatory. Endpoint and model defaults live in code so that
the runtime and tests share them.

## Schema Changes

After editing the Drizzle schema:

```bash
just db-generate
just migrate
```

Do not use `db-push` for changes that need a committed migration.

## Verification

Run the isolated API suite:

```bash
just test-apis
```

The RAG service tests cover retrieval, persistence, source storage, and degraded
behavior. A live generation check additionally requires PostgreSQL and valid
OpenRouter credentials.
# BYOK Isolation

User-owned OpenAI, Gemini, and Anthropic credentials are used only for direct
presentation generation. All source, slide, deck, and retrieval embeddings
continue to use `OPEN_ROUTER_API_KEY`, `OPEN_ROUTER_EMBEDDINGS_URL`, and
`EMBEDDING_MODEL`.
