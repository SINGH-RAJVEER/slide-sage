-- +goose Up
CREATE TABLE generation_jobs (
	id text PRIMARY KEY,
	river_job_id bigint UNIQUE,
	operation_id text NOT NULL UNIQUE REFERENCES generation_point_operations(id) ON DELETE CASCADE,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	presentation_id text NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
	kind varchar(20) NOT NULL CHECK (kind IN ('generation', 'iteration')),
	payload jsonb NOT NULL,
	expected_revision integer NOT NULL CHECK (expected_revision >= 0),
	status varchar(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'retrying', 'succeeded', 'failed', 'cancelled')),
	stage varchar(32),
	progress_completed integer NOT NULL DEFAULT 0 CHECK (progress_completed >= 0),
	progress_total integer NOT NULL DEFAULT 3 CHECK (progress_total > 0),
	last_error_code varchar(64),
	last_error_message text,
	cancel_requested_at timestamptz,
	started_at timestamptz,
	completed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT NOW(),
	updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX generation_jobs_user_created_idx
	ON generation_jobs(user_id, created_at DESC);

CREATE INDEX generation_jobs_active_idx
	ON generation_jobs(status, created_at)
	WHERE status IN ('queued', 'running', 'retrying');

CREATE TABLE generation_job_events (
	id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	job_id text NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
	event_type varchar(32) NOT NULL,
	payload jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX generation_job_events_job_id_idx
	ON generation_job_events(job_id, id);
