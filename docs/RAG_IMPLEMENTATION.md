# RAG and Semantic Memory Implementation

Slide Sage uses PostgreSQL, pgvector, and OpenRouter embeddings to retrieve semantic context for presentation generation and iteration.

The important split is:

- Store exact presentation state as normal relational data and `jsonb`.
- Store embeddings only for natural-language meaning: summaries, prompts, source chunks, templates, examples, style, and feedback.
- Use normal indexes for exact lookup such as `user_id`, `presentation_id`, `slide_id`, timestamps, URLs, and JSON schema validation.

## Core Service

`apps/APIs/src/services/rag.service.ts` owns embedding generation, semantic-memory storage, retrieval, and context formatting.

Key methods:

```ts
generateEmbedding(text)
storeSourceChunks(userId, query, sources, presentationId?)
storePresentationSemanticMemory(params)
rankSourcesBySemanticRelevance(query, sources, limit)
retrieveSimilarContexts(userId, presentationId, query, topK, similarityThreshold)
buildRagContextString(userId, presentationId, query)
buildGenerationMemoryContextString(userId, query)
cleanupOldEmbeddings(userId, daysToKeep)
```

Embeddings are generated through OpenRouter with:

```bash
OPEN_ROUTER_API_KEY=your-openrouter-key
EMBEDDING_MODEL=nvidia/llama-nemotron-embed-vl-1b-v2:free
OPEN_ROUTER_EMBEDDINGS_URL=https://openrouter.ai/api/v1/embeddings
```

The current schema stores 768-dimensional vectors.

## Tables

Semantic-memory tables:

- `slide_embeddings`: one row per slide summary, with the exact slide JSON stored separately in `slide_json`.
- `deck_memories`: deck-level summaries such as title, prompt, theme, tone, detail level, and slide summaries.
- `source_chunks`: embedded search-result chunks with URL, title, fetched timestamp, and chunk text.
- `prompt_events`: user prompts and their nearest interpreted intent.
- `slide_templates`: seeded global layout/template descriptions such as roadmap, comparison matrix, market size, and architecture.
- `example_generations`: successful prompt-to-slide-JSON examples for few-shot retrieval.
- `style_memories`: deck style summaries for theme, tone, detail level, and slide-type mix.
- `feedback_memories`: applied iteration feedback.
- `semantic_commands`: seeded common edit intents used to classify prompts semantically.
- `rag_context`: audit trail of retrieved context used in prompts.

All embedding columns use HNSW cosine indexes.

## Generation Flow

```txt
1. User starts generation.
2. AIService asks RAGService for generation memory:
   - relevant slide templates
   - similar example generations
   - user style memories
3. If web research is enabled, SearchService fetches live Exa results with highlights and summaries.
4. RAGService ranks the fresh sources by embedding similarity.
5. AIService generates the deck with memory and ranked research context.
6. After the presentation is saved, PresentationService stores semantic memory:
   - deck summary
   - slide summaries
   - prompt event
   - style memory
   - example generation
   - source chunks, when sources exist
```

Live search is still required for latest information. Cached source chunks are retrieval aids only; they do not replace a freshness check.

## Iteration Flow

```txt
1. User sends feedback for an existing presentation.
2. RAGService embeds the feedback and retrieves relevant memories:
   - current slide summaries
   - deck summary
   - prompt history
   - source chunks
   - templates
   - similar examples
   - style memory
   - feedback memory
3. Retrieved context is formatted as "RELEVANT SEMANTIC MEMORY" and prepended to the model prompt.
4. If research is enabled, fresh search results are ranked by embeddings before summarization and generation.
5. After save, the current slide/deck/style/source memories are refreshed and the prompt/feedback/example history is preserved.
```

Current-state memories are refreshed for the presentation so stale slide summaries do not compete with the latest deck. Historical prompt, feedback, and example rows are kept to preserve iteration history.

## Source Retrieval

Search results are handled in two separate steps:

1. Fresh retrieval with Exa search.
2. Semantic ranking and caching with embeddings.

This means prompts like "add latest market size statistics" still need live search enabled. Embeddings help choose the most relevant snippets and reuse recent chunks later when they are still appropriate.

## Template and Intent Seeding

`RAGService` lazily seeds default templates and semantic commands the first time it needs them for the configured embedding model.

Default templates include:

- Problem slide
- Solution slide
- Market size slide
- Competitive matrix
- Timeline roadmap
- Architecture diagram
- Case study slide
- SWOT analysis

Default command intents include:

- `make_shorter`
- `increase_technical_depth`
- `add_grounded_data`
- `change_tone`
- `simplify`
- `change_layout`
- `make_visual`
- `insert_slide`
- `delete_slide`
- `reuse_style`

## Migration

The semantic-memory schema is added by:

```txt
packages/database/drizzle/0007_semantic_memory_vectors.sql
```

Run database migrations before relying on the new memory paths:

```bash
bun run --cwd packages/database db:migrate
```

## Cleanup

`RAGService.cleanupOldEmbeddings(userId, daysToKeep)` deletes old rows from all user-owned embedding tables:

- search embeddings
- presentation embeddings
- slide embeddings
- deck memories
- source chunks
- prompt events
- example generations
- style memories
- feedback memories

Template and command seeds are global and are not removed by per-user cleanup.

## Troubleshooting

If no semantic context is retrieved:

- Confirm the migration has run.
- Confirm `OPEN_ROUTER_API_KEY` is configured.
- Confirm `EMBEDDING_MODEL` returns 768-dimensional vectors.
- Lower the retrieval threshold temporarily.
- Check `rag_context` for stored retrieval audits.

If latest research looks stale:

- Enable web research on the request.
- Do not rely on cached `source_chunks` alone for latest facts.
- Check `retrieved_at` and `fetched_at` timestamps before reusing source context.
