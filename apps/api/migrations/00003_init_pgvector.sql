-- +goose Up
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create search_embeddings table
CREATE TABLE IF NOT EXISTS search_embeddings (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  search_query text NOT NULL,
  embedding vector(1536),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_search_embeddings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for search_embeddings
CREATE INDEX IF NOT EXISTS search_embeddings_user_id_idx ON search_embeddings(user_id);
CREATE INDEX IF NOT EXISTS search_embeddings_embedding_idx ON search_embeddings USING hnsw (embedding vector_cosine_ops);

-- Create presentation_embeddings table
CREATE TABLE IF NOT EXISTS presentation_embeddings (
  id text PRIMARY KEY,
  presentation_id text NOT NULL,
  user_id text NOT NULL,
  iteration_prompt text NOT NULL,
  presentation_content text,
  embedding vector(1536),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_presentation_embeddings_presentation FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE,
  CONSTRAINT fk_presentation_embeddings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for presentation_embeddings
CREATE INDEX IF NOT EXISTS presentation_embeddings_presentation_id_idx ON presentation_embeddings(presentation_id);
CREATE INDEX IF NOT EXISTS presentation_embeddings_user_id_idx ON presentation_embeddings(user_id);
CREATE INDEX IF NOT EXISTS presentation_embeddings_embedding_idx ON presentation_embeddings USING hnsw (embedding vector_cosine_ops);

-- Create rag_context table
CREATE TABLE IF NOT EXISTS rag_context (
  id text PRIMARY KEY,
  presentation_id text NOT NULL,
  user_id text NOT NULL,
  source_type varchar(50) NOT NULL,
  source_id text,
  retrieved_context text NOT NULL,
  similarity_score real,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_rag_context_presentation FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE,
  CONSTRAINT fk_rag_context_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for rag_context
CREATE INDEX IF NOT EXISTS rag_context_presentation_id_idx ON rag_context(presentation_id);
CREATE INDEX IF NOT EXISTS rag_context_user_id_idx ON rag_context(user_id);
CREATE INDEX IF NOT EXISTS rag_context_source_type_idx ON rag_context(source_type);
