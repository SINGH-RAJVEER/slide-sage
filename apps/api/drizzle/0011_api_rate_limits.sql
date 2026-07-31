CREATE TABLE api_rate_limits (
    scope varchar(80) NOT NULL,
    key_hash varchar(64) NOT NULL,
    window_start timestamp with time zone NOT NULL,
    request_count integer NOT NULL DEFAULT 1,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT api_rate_limits_pkey PRIMARY KEY (scope, key_hash, window_start),
    CONSTRAINT api_rate_limits_request_count_check CHECK (request_count > 0)
);

CREATE INDEX api_rate_limits_expires_at_idx ON api_rate_limits(expires_at);
