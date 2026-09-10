-- +goose Up
-- The semantic pipeline is gone. Presentations without a committed PPTX revision
-- carry no canonical document, so they are discarded outright and the
-- document_kind discriminator loses its second value along with them.

-- A reserved lease outlives its presentation and its cascade-deleted job, and the
-- partial unique index on (user_id) blocks every later generation while it sits
-- there, so these leases are expired for normal recovery to refund.
UPDATE generation_point_operations SET expires_at = NOW()
	WHERE status = 'reserved'
		AND presentation_id IN (SELECT id FROM presentations WHERE current_pptx_revision IS NULL);

DELETE FROM presentations WHERE current_pptx_revision IS NULL;

ALTER TABLE presentations
	DROP CONSTRAINT IF EXISTS presentations_document_revision_check,
	DROP CONSTRAINT IF EXISTS presentations_document_kind_check,
	DROP COLUMN IF EXISTS document_kind;

-- +goose Down
ALTER TABLE presentations
	ADD COLUMN document_kind varchar(16) NOT NULL DEFAULT 'legacy';

UPDATE presentations SET document_kind = 'pptx' WHERE current_pptx_revision IS NOT NULL;

ALTER TABLE presentations
	ADD CONSTRAINT presentations_document_kind_check
		CHECK (document_kind IN ('legacy', 'pptx')),
	ADD CONSTRAINT presentations_document_revision_check
		CHECK (
			(document_kind = 'legacy' AND current_pptx_revision IS NULL)
			OR (document_kind = 'pptx' AND current_pptx_revision IS NOT NULL)
		);
