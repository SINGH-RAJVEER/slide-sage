-- +goose Up
ALTER TABLE presentations
    ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 0;

ALTER TABLE generation_point_operations
    DROP CONSTRAINT IF EXISTS generation_point_operations_quote_check;
ALTER TABLE generation_point_operations
    ADD CONSTRAINT generation_point_operations_quote_check CHECK (quoted_points >= 0);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);
CREATE INDEX IF NOT EXISTS verifications_identifier_idx ON verifications(identifier);

CREATE TABLE IF NOT EXISTS payments (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    razorpay_order_id text NOT NULL,
    razorpay_payment_id text,
    amount_paise integer NOT NULL,
    tokens_granted real NOT NULL,
    status varchar(50) DEFAULT 'created' NOT NULL,
    created_at timestamp DEFAULT NOW() NOT NULL,
    updated_at timestamp DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_order_id_unique
    ON payments(razorpay_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_payment_id_unique
    ON payments(razorpay_payment_id);

ALTER TABLE example_generations ADD COLUMN IF NOT EXISTS presentation_id text;
UPDATE example_generations AS example
SET presentation_id = example.metadata->>'presentationId'
WHERE example.presentation_id IS NULL
  AND example.metadata ? 'presentationId'
  AND EXISTS (
      SELECT 1 FROM presentations
      WHERE presentations.id = example.metadata->>'presentationId'
  );
CREATE INDEX IF NOT EXISTS example_generations_presentation_id_idx
    ON example_generations(presentation_id);
-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'example_generations_presentation_id_fkey'
    ) THEN
        ALTER TABLE example_generations
            ADD CONSTRAINT example_generations_presentation_id_fkey
            FOREIGN KEY (presentation_id) REFERENCES presentations(id) ON DELETE CASCADE;
    END IF;
END $$;
-- +goose StatementEnd

-- +goose StatementBegin
DO $$
DECLARE
    current_type text;
BEGIN
    IF to_regclass('public.search_embeddings') IS NOT NULL THEN
        SELECT format_type(attribute.atttypid, attribute.atttypmod)
        INTO current_type
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.search_embeddings'::regclass
          AND attribute.attname = 'embedding'
          AND NOT attribute.attisdropped;

        IF current_type IS DISTINCT FROM 'vector(768)' THEN
            DROP INDEX IF EXISTS search_embeddings_embedding_idx;
            UPDATE search_embeddings SET embedding = NULL WHERE embedding IS NOT NULL;
            ALTER TABLE search_embeddings
                ALTER COLUMN embedding TYPE vector(768) USING NULL::vector(768);
            CREATE INDEX search_embeddings_embedding_idx
                ON search_embeddings USING hnsw (embedding vector_cosine_ops);
        END IF;
    END IF;

    IF to_regclass('public.presentation_embeddings') IS NOT NULL THEN
        SELECT format_type(attribute.atttypid, attribute.atttypmod)
        INTO current_type
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = 'public.presentation_embeddings'::regclass
          AND attribute.attname = 'embedding'
          AND NOT attribute.attisdropped;

        IF current_type IS DISTINCT FROM 'vector(768)' THEN
            DROP INDEX IF EXISTS presentation_embeddings_embedding_idx;
            UPDATE presentation_embeddings SET embedding = NULL WHERE embedding IS NOT NULL;
            ALTER TABLE presentation_embeddings
                ALTER COLUMN embedding TYPE vector(768) USING NULL::vector(768);
            CREATE INDEX presentation_embeddings_embedding_idx
                ON presentation_embeddings USING hnsw (embedding vector_cosine_ops);
        END IF;
    END IF;
END $$;
-- +goose StatementEnd
