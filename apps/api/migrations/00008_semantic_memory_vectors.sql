-- +goose Up
-- Add semantic memory tables for slide, deck, source, prompt, template, example,
-- style, feedback, and command embeddings.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS slide_embeddings (
  id text PRIMARY KEY,
  presentation_id text NOT NULL,
  user_id text NOT NULL,
  slide_id text NOT NULL,
  slide_index integer NOT NULL,
  slide_type varchar(100) NOT NULL,
  title text,
  summary text NOT NULL,
  slide_json jsonb NOT NULL,
  embedding vector(768),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_slide_embeddings_presentation FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE,
  CONSTRAINT fk_slide_embeddings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS slide_embeddings_presentation_id_idx ON slide_embeddings(presentation_id);
CREATE INDEX IF NOT EXISTS slide_embeddings_user_id_idx ON slide_embeddings(user_id);
CREATE INDEX IF NOT EXISTS slide_embeddings_presentation_slide_idx ON slide_embeddings(presentation_id, slide_index);
CREATE INDEX IF NOT EXISTS slide_embeddings_embedding_idx ON slide_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS deck_memories (
  id text PRIMARY KEY,
  presentation_id text NOT NULL,
  user_id text NOT NULL,
  memory_type varchar(80) NOT NULL,
  content text NOT NULL,
  embedding vector(768),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_deck_memories_presentation FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE,
  CONSTRAINT fk_deck_memories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS deck_memories_presentation_id_idx ON deck_memories(presentation_id);
CREATE INDEX IF NOT EXISTS deck_memories_user_id_idx ON deck_memories(user_id);
CREATE INDEX IF NOT EXISTS deck_memories_memory_type_idx ON deck_memories(memory_type);
CREATE INDEX IF NOT EXISTS deck_memories_embedding_idx ON deck_memories USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS source_chunks (
  id text PRIMARY KEY,
  presentation_id text,
  user_id text NOT NULL,
  source_url text NOT NULL,
  title text,
  published_at timestamp,
  fetched_at timestamp NOT NULL DEFAULT NOW(),
  chunk_text text NOT NULL,
  embedding vector(768),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_source_chunks_presentation FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE,
  CONSTRAINT fk_source_chunks_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS source_chunks_presentation_id_idx ON source_chunks(presentation_id);
CREATE INDEX IF NOT EXISTS source_chunks_user_id_idx ON source_chunks(user_id);
CREATE INDEX IF NOT EXISTS source_chunks_source_url_idx ON source_chunks(source_url);
CREATE INDEX IF NOT EXISTS source_chunks_fetched_at_idx ON source_chunks(fetched_at);
CREATE INDEX IF NOT EXISTS source_chunks_embedding_idx ON source_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS prompt_events (
  id text PRIMARY KEY,
  presentation_id text NOT NULL,
  user_id text NOT NULL,
  user_prompt text NOT NULL,
  interpreted_intent varchar(100) NOT NULL,
  embedding vector(768),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_prompt_events_presentation FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE,
  CONSTRAINT fk_prompt_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS prompt_events_presentation_id_idx ON prompt_events(presentation_id);
CREATE INDEX IF NOT EXISTS prompt_events_user_id_idx ON prompt_events(user_id);
CREATE INDEX IF NOT EXISTS prompt_events_interpreted_intent_idx ON prompt_events(interpreted_intent);
CREATE INDEX IF NOT EXISTS prompt_events_embedding_idx ON prompt_events USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS slide_templates (
  id text PRIMARY KEY,
  template_name varchar(120) NOT NULL,
  template_description text NOT NULL,
  slide_type varchar(100) NOT NULL,
  schema_hint jsonb,
  embedding vector(768),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS slide_templates_template_name_idx ON slide_templates(template_name);
CREATE INDEX IF NOT EXISTS slide_templates_slide_type_idx ON slide_templates(slide_type);
CREATE INDEX IF NOT EXISTS slide_templates_embedding_idx ON slide_templates USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS example_generations (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  prompt text NOT NULL,
  summary text NOT NULL,
  output_json jsonb NOT NULL,
  embedding vector(768),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_example_generations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS example_generations_user_id_idx ON example_generations(user_id);
CREATE INDEX IF NOT EXISTS example_generations_embedding_idx ON example_generations USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS style_memories (
  id text PRIMARY KEY,
  presentation_id text,
  user_id text NOT NULL,
  content text NOT NULL,
  embedding vector(768),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_style_memories_presentation FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE,
  CONSTRAINT fk_style_memories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS style_memories_presentation_id_idx ON style_memories(presentation_id);
CREATE INDEX IF NOT EXISTS style_memories_user_id_idx ON style_memories(user_id);
CREATE INDEX IF NOT EXISTS style_memories_embedding_idx ON style_memories USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS feedback_memories (
  id text PRIMARY KEY,
  presentation_id text NOT NULL,
  user_id text NOT NULL,
  feedback_text text NOT NULL,
  outcome varchar(50) NOT NULL,
  embedding vector(768),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_feedback_memories_presentation FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_memories_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS feedback_memories_presentation_id_idx ON feedback_memories(presentation_id);
CREATE INDEX IF NOT EXISTS feedback_memories_user_id_idx ON feedback_memories(user_id);
CREATE INDEX IF NOT EXISTS feedback_memories_outcome_idx ON feedback_memories(outcome);
CREATE INDEX IF NOT EXISTS feedback_memories_embedding_idx ON feedback_memories USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS semantic_commands (
  id text PRIMARY KEY,
  command_text text NOT NULL,
  intent varchar(100) NOT NULL,
  route varchar(100) NOT NULL,
  embedding vector(768),
  embedding_model varchar(100) NOT NULL,
  metadata jsonb,
  created_at timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS semantic_commands_intent_idx ON semantic_commands(intent);
CREATE INDEX IF NOT EXISTS semantic_commands_route_idx ON semantic_commands(route);
CREATE INDEX IF NOT EXISTS semantic_commands_embedding_idx ON semantic_commands USING hnsw (embedding vector_cosine_ops);
