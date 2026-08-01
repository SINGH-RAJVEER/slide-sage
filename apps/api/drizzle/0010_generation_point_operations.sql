CREATE TABLE generation_point_operations (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    presentation_id text REFERENCES presentations(id) ON DELETE SET NULL,
    kind varchar(20) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'reserved',
    quoted_points real NOT NULL,
    charged_points real,
    balance_after real,
    created_at timestamp NOT NULL DEFAULT NOW(),
    updated_at timestamp NOT NULL DEFAULT NOW(),
    finalized_at timestamp,
    expires_at timestamp NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
    CONSTRAINT generation_point_operations_kind_check
        CHECK (kind IN ('generation', 'iteration')),
    CONSTRAINT generation_point_operations_status_check
        CHECK (status IN ('reserved', 'settled', 'refunded')),
    CONSTRAINT generation_point_operations_quote_check CHECK (quoted_points >= 0),
    CONSTRAINT generation_point_operations_charge_check
        CHECK (charged_points IS NULL OR (charged_points >= 0 AND charged_points <= quoted_points))
);

CREATE INDEX generation_point_operations_user_id_idx
    ON generation_point_operations(user_id);

CREATE INDEX generation_point_operations_presentation_id_idx
    ON generation_point_operations(presentation_id);

CREATE INDEX generation_point_operations_expires_at_idx
    ON generation_point_operations(expires_at);
