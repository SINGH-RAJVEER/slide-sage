-- +goose Up
-- Point values are stored as integer milli-points: 1 point = 1,000 milli-points.
DROP TABLE IF EXISTS point_ledger CASCADE;
DROP TABLE IF EXISTS generation_point_operations CASCADE;
TRUNCATE TABLE users CASCADE;

ALTER TABLE users
	DROP CONSTRAINT IF EXISTS users_balance_millis_nonnegative,
	DROP COLUMN IF EXISTS balance_millis;

ALTER TABLE users
	ADD COLUMN balance_millis bigint NOT NULL DEFAULT 50000,
	ADD CONSTRAINT users_balance_millis_nonnegative CHECK (balance_millis >= 0);

ALTER TABLE users DROP COLUMN IF EXISTS slide_tokens;

ALTER TABLE payments
	DROP CONSTRAINT IF EXISTS payments_amount_paise_positive,
	DROP CONSTRAINT IF EXISTS payments_tokens_granted_millis_positive,
	DROP CONSTRAINT IF EXISTS payments_status_valid,
	DROP COLUMN IF EXISTS tokens_granted_millis;

ALTER TABLE payments
	ADD COLUMN tokens_granted_millis bigint NOT NULL,
	ADD CONSTRAINT payments_amount_paise_positive CHECK (amount_paise > 0),
	ADD CONSTRAINT payments_tokens_granted_millis_positive CHECK (tokens_granted_millis > 0),
	ADD CONSTRAINT payments_status_valid CHECK (status IN ('created', 'paid'));

ALTER TABLE payments DROP COLUMN IF EXISTS tokens_granted;

CREATE TABLE generation_point_operations (
	id text PRIMARY KEY,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	presentation_id text REFERENCES presentations(id) ON DELETE SET NULL,
	kind varchar(20) NOT NULL CHECK (kind IN ('generation', 'iteration', 'research')),
	status varchar(20) NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'refunded')),
	idempotency_key varchar(128) NOT NULL,
	request_hash char(64) NOT NULL,
	pricing_version varchar(32) NOT NULL,
	quoted_millis bigint NOT NULL CHECK (quoted_millis >= 0),
	charged_millis bigint,
	balance_after_millis bigint,
	provider_input_tokens integer,
	provider_output_tokens integer,
	provider_total_tokens integer,
	error_reason text,
	created_at timestamptz NOT NULL DEFAULT NOW(),
	updated_at timestamptz NOT NULL DEFAULT NOW(),
	finalized_at timestamptz,
	expires_at timestamptz NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
	CONSTRAINT generation_point_operations_charge_valid CHECK (
		charged_millis IS NULL OR (charged_millis >= 0 AND charged_millis <= quoted_millis)
	),
	CONSTRAINT generation_point_operations_state_valid CHECK (
		(status = 'reserved' AND charged_millis IS NULL AND finalized_at IS NULL)
		OR (status = 'settled' AND charged_millis IS NOT NULL AND finalized_at IS NOT NULL)
		OR (status = 'refunded' AND charged_millis = 0 AND finalized_at IS NOT NULL)
	),
	CONSTRAINT generation_point_operations_expiry_valid CHECK (expires_at > created_at),
	UNIQUE (user_id, kind, idempotency_key)
);

CREATE INDEX generation_point_operations_active_lease_idx
	ON generation_point_operations(user_id, expires_at)
	WHERE status = 'reserved';

CREATE UNIQUE INDEX generation_point_operations_active_presentation_idx
	ON generation_point_operations(presentation_id)
	WHERE status = 'reserved' AND presentation_id IS NOT NULL;

CREATE UNIQUE INDEX generation_point_operations_active_user_idx
	ON generation_point_operations(user_id)
	WHERE status = 'reserved' AND kind IN ('generation', 'iteration');

CREATE TABLE point_ledger (
	id text PRIMARY KEY,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	operation_id text REFERENCES generation_point_operations(id) ON DELETE CASCADE,
	payment_id text REFERENCES payments(id) ON DELETE CASCADE,
	entry_type varchar(32) NOT NULL CHECK (entry_type IN ('signup_credit', 'purchase_credit', 'model_reservation', 'research_reservation', 'reservation_release', 'lease_release', 'adjustment')),
	delta_millis bigint NOT NULL CHECK (delta_millis <> 0),
	balance_after_millis bigint NOT NULL CHECK (balance_after_millis >= 0),
	created_at timestamptz NOT NULL DEFAULT NOW(),
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	CONSTRAINT point_ledger_source_present CHECK (operation_id IS NOT NULL OR payment_id IS NOT NULL OR entry_type IN ('signup_credit', 'adjustment')),
	UNIQUE (operation_id, entry_type),
	UNIQUE (payment_id, entry_type)
);

CREATE INDEX point_ledger_user_created_idx ON point_ledger(user_id, created_at, id);
