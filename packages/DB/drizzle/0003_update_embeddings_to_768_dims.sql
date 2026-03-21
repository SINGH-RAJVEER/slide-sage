-- Migration: Update embedding dimensions from 1536 to 768 for Gemini text-embedding-004
-- This migration updates the vector dimensions in both search_embeddings and presentation_embeddings tables

-- Step 1: Drop existing HNSW indexes (they depend on vector type)
DROP INDEX IF EXISTS search_embeddings_embedding_idx;
DROP INDEX IF EXISTS presentation_embeddings_embedding_idx;

-- Step 2: Alter the embedding column type in search_embeddings
-- Note: This will drop all existing embeddings data
ALTER TABLE search_embeddings ALTER COLUMN embedding TYPE vector(768);

-- Step 3: Alter the embedding column type in presentation_embeddings
-- Note: This will drop all existing embeddings data
ALTER TABLE presentation_embeddings ALTER COLUMN embedding TYPE vector(768);

-- Step 4: Recreate HNSW indexes with new dimensions
CREATE INDEX search_embeddings_embedding_idx ON search_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX presentation_embeddings_embedding_idx ON presentation_embeddings USING hnsw (embedding vector_cosine_ops);

-- Note: After running this migration, you will need to regenerate all embeddings
-- using the new Gemini text-embedding-004 model
