-- +goose Up
CREATE TABLE IF NOT EXISTS avatar_images (
	id text PRIMARY KEY,
	user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
	content_type text NOT NULL,
	data bytea NOT NULL,
	created_at timestamptz NOT NULL DEFAULT NOW()
);
