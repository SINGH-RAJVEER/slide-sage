-- +goose Up
ALTER TABLE presentation_revisions ADD COLUMN revision_index jsonb;

-- +goose Down
ALTER TABLE presentation_revisions DROP COLUMN revision_index;
