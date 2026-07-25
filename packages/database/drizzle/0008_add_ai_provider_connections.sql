CREATE TABLE IF NOT EXISTS ai_provider_connections (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider varchar(20) NOT NULL,
    encrypted_api_key text NOT NULL,
    encryption_iv text NOT NULL,
    encryption_key_version integer NOT NULL,
    key_last_four varchar(4) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'valid',
    validated_at timestamp NOT NULL,
    last_used_at timestamp,
    created_at timestamp NOT NULL DEFAULT NOW(),
    updated_at timestamp NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_provider_connections_user_provider_unique UNIQUE (user_id, provider),
    CONSTRAINT ai_provider_connections_provider_check CHECK (provider IN ('openai', 'google', 'anthropic')),
    CONSTRAINT ai_provider_connections_status_check CHECK (status IN ('valid', 'invalid'))
);

CREATE INDEX IF NOT EXISTS ai_provider_connections_user_id_idx
    ON ai_provider_connections(user_id);

CREATE TABLE IF NOT EXISTS user_ai_preferences (
    user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    selected_provider varchar(20) NOT NULL,
    selected_model varchar(160) NOT NULL,
    updated_at timestamp NOT NULL DEFAULT NOW(),
    CONSTRAINT user_ai_preferences_provider_check CHECK (selected_provider IN ('openai', 'google', 'anthropic'))
);

ALTER TABLE presentations ADD COLUMN IF NOT EXISTS ai_provider varchar(20);
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS ai_model varchar(160);
