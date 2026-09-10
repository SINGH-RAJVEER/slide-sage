-- +goose Up
-- The semantic memory and cache schema belonged to the retired semantic
-- generation pipeline: slide, deck, source, prompt, template, example, style,
-- feedback and command embeddings, plus the outline cache that read them. No
-- code has written to or read from any of these tables since the canonical
-- PPTX pipeline replaced that path, so they hold only orphaned rows.
--
-- This is an intentional deletion. The embeddings cannot be reconstructed from
-- the canonical decks, and nothing consumes them.

DROP TABLE IF EXISTS semantic_cache_entries;
DROP TABLE IF EXISTS semantic_commands;
DROP TABLE IF EXISTS feedback_memories;
DROP TABLE IF EXISTS style_memories;
DROP TABLE IF EXISTS example_generations;
DROP TABLE IF EXISTS slide_templates;
DROP TABLE IF EXISTS prompt_events;
DROP TABLE IF EXISTS source_chunks;
DROP TABLE IF EXISTS deck_memories;
DROP TABLE IF EXISTS slide_embeddings;

-- The vector extension is left installed. Dropping it would fail against any
-- other vector column and it costs nothing to keep.

-- +goose Down
-- The dropped tables held derived embeddings that no longer have a producer.
-- Recreating empty tables would restore the schema but not the data, and
-- nothing reads them, so this migration is not reversible.
SELECT 1;
