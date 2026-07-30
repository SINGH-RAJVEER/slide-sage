CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS semantic_cache_entries (
    id varchar(64) PRIMARY KEY,
    namespace varchar(32) NOT NULL,
    exact_key varchar(64) NOT NULL,
    variant_hash varchar(64) NOT NULL,
    query_embedding vector(768) NOT NULL,
    embedding_model varchar(100) NOT NULL,
    query_metadata jsonb,
    payload jsonb NOT NULL,
    expires_at timestamp NOT NULL,
    hit_count integer NOT NULL DEFAULT 0,
    last_accessed_at timestamp,
    created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS semantic_cache_entries_namespace_exact_key_idx
    ON semantic_cache_entries(namespace, exact_key);
CREATE INDEX IF NOT EXISTS semantic_cache_entries_variant_expiry_idx
    ON semantic_cache_entries(namespace, variant_hash, expires_at);
CREATE INDEX IF NOT EXISTS semantic_cache_entries_embedding_idx
    ON semantic_cache_entries USING hnsw (query_embedding vector_cosine_ops);
