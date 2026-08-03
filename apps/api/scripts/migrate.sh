#!/usr/bin/env bash

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
migrations_dir="$(cd -- "${script_dir}/../migrations" && pwd)"
legacy_final_timestamp="1785542400002"
legacy_table="$(psql "${DATABASE_URL}" -Atqc "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL")"
goose_table="$(psql "${DATABASE_URL}" -Atqc "SELECT to_regclass('public.goose_db_version') IS NOT NULL")"

if [[ "${legacy_table}" == "t" && "${goose_table}" != "t" ]]; then
    legacy_latest="$(psql "${DATABASE_URL}" -Atqc 'SELECT COALESCE(MAX(created_at), 0) FROM drizzle.__drizzle_migrations')"
    if [[ "${legacy_latest}" != "${legacy_final_timestamp}" ]]; then
        printf 'Cannot automatically adopt partial Drizzle migration history (latest timestamp: %s).\n' "${legacy_latest}" >&2
        exit 1
    fi

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
    printf 'Adopted existing Drizzle migration history at Goose version 13.\n'
fi

if [[ "$#" -eq 0 ]]; then
    set -- up
fi

exec goose -dir "${migrations_dir}" postgres "${DATABASE_URL}" "$@"
