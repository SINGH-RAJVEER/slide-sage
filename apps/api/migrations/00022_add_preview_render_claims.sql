-- +goose Up
ALTER TABLE presentation_revisions
	ADD COLUMN preview_started_at timestamptz;

ALTER TABLE presentation_revisions
	ADD CONSTRAINT presentation_revisions_preview_started_check
		CHECK (preview_status <> 'rendering' OR preview_started_at IS NOT NULL);

CREATE INDEX presentation_revisions_preview_claim_idx
	ON presentation_revisions(preview_status, preview_started_at)
	WHERE preview_status <> 'ready';

-- +goose Down
DROP INDEX IF EXISTS presentation_revisions_preview_claim_idx;

ALTER TABLE presentation_revisions
	DROP CONSTRAINT IF EXISTS presentation_revisions_preview_started_check,
	DROP COLUMN IF EXISTS preview_started_at;
