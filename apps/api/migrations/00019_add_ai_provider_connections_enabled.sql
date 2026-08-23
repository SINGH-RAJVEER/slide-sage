-- +goose Up
ALTER TABLE ai_provider_connections ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
