-- +goose Up
ALTER TABLE user_ai_preferences ADD COLUMN IF NOT EXISTS use_byok boolean NOT NULL DEFAULT true;

-- The toggle may be persisted before a provider selection exists, so the
-- selection columns become optional.
ALTER TABLE user_ai_preferences ALTER COLUMN selected_provider DROP NOT NULL;
ALTER TABLE user_ai_preferences ALTER COLUMN selected_model DROP NOT NULL;
