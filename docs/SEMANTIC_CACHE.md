# Semantic Cache

SlideSage shares fresh web-search results and presentation outlines through a
PostgreSQL semantic cache backed by pgvector. Full decks, iterations, and
user-scoped RAG memories are never served from this cache.

## Lookup

`apps/APIs/src/services/semantic-cache.service.ts` performs cache resolution in
this order:

1. Hash the normalized query and hard request variant, then check an exact key.
2. On an exact miss, generate the existing 768-dimensional OpenRouter embedding.
3. Retrieve unexpired HNSW candidates with the same namespace, variant, and
   embedding model.
4. Reject candidates whose numbers or temporal words differ from the request.
5. Serve a candidate above the configured cosine-similarity threshold.
6. On a miss, call the provider and write the validated response through.

Cache reads, embedding calls, writes, and hit updates fail open. Provider behavior
therefore remains available when PostgreSQL cache operations fail. Expired rows
are ignored during lookup and removed after successful cache writes.

`SEMANTIC_CACHE_MODE=shadow` records semantic candidates without serving them.
Exact hits still serve in shadow mode. Use shadow mode to calibrate thresholds
before changing them in production. `off` bypasses all cache reads and writes.

## Search

Search entries are global and their hard variant includes result count, domain
filters, publication bounds, freshness, and `maxAgeHours`. `maxAgeHours=0`
bypasses the cache. Default expiry is 15 minutes for day freshness, one hour for
week or unspecified freshness, six hours for month freshness, and 24 hours for
year freshness. `SEARCH_CACHE_TTL_SECONDS` overrides these defaults.

The original source `retrieved_at` is preserved. After a hit, sources still pass
through query-specific semantic ranking and are stored separately as user-scoped
RAG memory when a presentation uses them.

## Outlines

Only new-presentation outlines are shared. Cacheable outline prompts exclude
user-scoped generation memory. The cache variant includes the model, slide count,
content settings, prompt version, and public research source content. Layout is
automatic and does not partition the cache. Requests containing a user-supplied
`research_payload` bypass outline caching.

Full slide drafting remains a live, personalized model call. Iteration outlines
also remain live because they depend on an owned presentation and private
feedback.

All ordinary generation topics are globally cacheable by default. Raw topic text
is not stored in `semantic_cache_entries`, but the embedding and generated outline
can still reflect the topic. Deployments handling confidential topics should set
`SEMANTIC_CACHE_MODE=off` until a product-level private-generation control is
available.

## Billing

OpenRouter usage from the outline and slide-drafting calls is aggregated into
`tokens_used`. A cached outline contributes zero new model tokens. Successful
requests convert measured usage at one slide token per 1,000 AI tokens and cap
the charge at the preflight quote. If a provider omits usage, the quote is used.
Failed requests remain uncharged.

The final `saved` event includes `slide_tokens_charged` and
`slide_tokens_remaining`.

## Schema

Migration `0008_semantic_cache.sql` creates `semantic_cache_entries` with:

- Exact and hard-variant hashes
- Query embedding and embedding-model identity
- Numeric and temporal guard metadata
- JSON response payload
- Expiration and hit metadata
- Unique exact-key and HNSW cosine indexes

Apply it with the normal migration command before enabling the cache.
