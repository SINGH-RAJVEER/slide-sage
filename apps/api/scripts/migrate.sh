#!/usr/bin/env bash

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
migrations_dir="$(cd -- "${script_dir}/../migrations" && pwd)"
goose_table="$(psql "${DATABASE_URL}" -Atqc "SELECT to_regclass('public.goose_db_version') IS NOT NULL")"
baseline_schema="$(psql "${DATABASE_URL}" -Atqc "
    SELECT to_regclass('public.users') IS NOT NULL
        AND to_regclass('public.presentations') IS NOT NULL
        AND to_regclass('public.ai_provider_connections') IS NOT NULL
        AND to_regclass('public.generation_point_operations') IS NOT NULL
        AND to_regclass('public.api_rate_limits') IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
                AND table_name = 'presentations'
                AND column_name = 'revision'
        )
")"

if [[ "${baseline_schema}" == "t" && "${goose_table}" != "t" ]]; then
    psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE goose_db_version (
    id serial PRIMARY KEY,
    version_id bigint NOT NULL,
    is_applied boolean NOT NULL,
    tstamp timestamp NOT NULL DEFAULT NOW()
);
INSERT INTO goose_db_version (version_id, is_applied) VALUES (0, true);
INSERT INTO goose_db_version (version_id, is_applied)
SELECT version, true FROM generate_series(1, 13) AS version;
SQL
    printf 'Baselined existing Go API schema at Goose version 13.\n'
fi

if [[ "$#" -eq 0 ]]; then
    set -- up
fi

exec goose -dir "${migrations_dir}" postgres "${DATABASE_URL}" "$@"
