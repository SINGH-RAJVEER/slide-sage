{
    description = "SlideSage development environment";

    inputs = {
        nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
        flake-utils.url = "github:numtide/flake-utils";
    };

    outputs = { self, nixpkgs, flake-utils }:
        flake-utils.lib.eachDefaultSystem (system:
            let
                pkgs = import nixpkgs { inherit system; };

                dbName = "slidesage";
                dbUser = "slidesage";
                dbPassword = "slidesage";
                dbPort = "5432";
                apisPort = "8000";
                webPort = "5173";
                litellmPort = "4000";

                postgres = pkgs.postgresql_17.withPackages (ps: [ ps.pgvector ]);
                python = pkgs.python3.withPackages (ps: with ps; [ litellm ] ++ litellm.optional-dependencies.proxy ++ litellm.optional-dependencies.proxy-runtime);

                initDb = pkgs.writeShellApplication {
                    name = "slidesage-init-db";
                    runtimeInputs = [ postgres pkgs.coreutils ];
                    text = ''
                        set -euo pipefail

                        export PGDATA="''${SLIDESAGE_PGDATA:-$PWD/.devenv/state/postgres}"
                        export PGHOST="127.0.0.1"
                        export PGPORT="''${POSTGRES_PORT:-${dbPort}}"
                        export PGUSER="postgres"

                        mkdir -p "$(dirname "$PGDATA")"

                        if [ ! -s "$PGDATA/PG_VERSION" ]; then
                            echo "Initializing PostgreSQL data directory at $PGDATA"
                            initdb -D "$PGDATA" --username=postgres --encoding=UTF8 --locale=C
                            cat >> "$PGDATA/postgresql.conf" <<CONF
listen_addresses = '127.0.0.1'
port = ${dbPort}
CONF
                            cat >> "$PGDATA/pg_hba.conf" <<CONF
host all all 127.0.0.1/32 trust
host all all ::1/128 trust
CONF
                        fi

                        if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
                            echo "PostgreSQL is already running."
                        else
                            echo "Starting PostgreSQL..."
                            pg_ctl -D "$PGDATA" -l "$PGDATA/postgres.log" -o "-k $PGDATA" start
                        fi

                        until pg_isready -h 127.0.0.1 -p "${dbPort}" -U postgres >/dev/null 2>&1; do
                            sleep 1
                        done

                        if ! psql -h 127.0.0.1 -p "${dbPort}" -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${dbUser}'" | grep -q 1; then
                            psql -h 127.0.0.1 -p "${dbPort}" -U postgres -d postgres -c "CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}'"
                        fi

                        if ! psql -h 127.0.0.1 -p "${dbPort}" -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${dbName}'" | grep -q 1; then
                            psql -h 127.0.0.1 -p "${dbPort}" -U postgres -d postgres -c "CREATE DATABASE ${dbName} OWNER ${dbUser}"
                        fi

                        psql -h 127.0.0.1 -p "${dbPort}" -U postgres -d "${dbName}" -c "CREATE EXTENSION IF NOT EXISTS vector"
                        psql -h 127.0.0.1 -p "${dbPort}" -U postgres -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser}"
                    '';
                };

                stopDb = pkgs.writeShellApplication {
                    name = "slidesage-stop-db";
                    runtimeInputs = [ postgres ];
                    text = ''
                        set -euo pipefail
                        export PGDATA="''${SLIDESAGE_PGDATA:-$PWD/.devenv/state/postgres}"

                        if [ -s "$PGDATA/PG_VERSION" ] && pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
                            pg_ctl -D "$PGDATA" stop -m fast
                        fi
                    '';
                };

                devUp = pkgs.writeShellApplication {
                    name = "slidesage-dev-up";
                    runtimeInputs = [
                        pkgs.bash
                        pkgs.bun
                        pkgs.coreutils
                        pkgs.curl
                        pkgs.process-compose
                        postgres
                        python
                        initDb
                        stopDb
                    ];
                    text = ''
                        set -euo pipefail

                        mkdir -p .devenv/process-compose .devenv/xdg-config/process-compose
                        export XDG_CONFIG_HOME="$PWD/.devenv/xdg-config"
                        export SLIDESAGE_PGDATA="$PWD/.devenv/state/postgres"

                        export POSTGRES_USER="''${POSTGRES_USER:-${dbUser}}"
                        export POSTGRES_PASSWORD="''${POSTGRES_PASSWORD:-${dbPassword}}"
                        export POSTGRES_DB="''${POSTGRES_DB:-${dbName}}"
                        export POSTGRES_PORT="''${POSTGRES_PORT:-${dbPort}}"
                        export DATABASE_URL="''${DATABASE_URL:-postgresql://${dbUser}:${dbPassword}@127.0.0.1:${dbPort}/${dbName}}"
                        export LITELLM_PROXY_BASE="''${LITELLM_PROXY_BASE:-http://127.0.0.1:${litellmPort}}"
                        export BASE_URL="''${BASE_URL:-http://localhost:${apisPort}}"
                        export CORS_ORIGIN="''${CORS_ORIGIN:-http://localhost:${webPort}}"
                        export VITE_API_URL="''${VITE_API_URL:-http://localhost:${webPort}}"
                        export VITE_PROXY_TARGET="''${VITE_PROXY_TARGET:-http://localhost:${apisPort}}"
                        export NODE_ENV="''${NODE_ENV:-development}"
                        export LOG_LEVEL="''${LOG_LEVEL:-debug}"

                        trap 'slidesage-stop-db >/dev/null 2>&1 || true' EXIT INT TERM

                        cat > .devenv/process-compose/dev.yaml <<'YAML'
                        version: "0.5"

                        processes:
                            postgres:
                                command: "slidesage-init-db && tail -f $SLIDESAGE_PGDATA/postgres.log"
                                availability:
                                    restart: "on_failure"
                                readiness_probe:
                                    exec:
                                        command: "pg_isready -h 127.0.0.1 -p 5432 -U slidesage -d slidesage"
                                    initial_delay_seconds: 1
                                    period_seconds: 2
                                    timeout_seconds: 2
                                    success_threshold: 1
                                    failure_threshold: 30

                            litellm:
                                command: "env -u DATABASE_URL litellm --config litellm_config.yaml --port 4000"
                                readiness_probe:
                                    http_get:
                                        host: "127.0.0.1"
                                        port: 4000
                                        path: "/health"
                                    initial_delay_seconds: 5
                                    period_seconds: 3
                                    timeout_seconds: 2
                                    success_threshold: 1
                                    failure_threshold: 30

                            migrate:
                                command: "cd packages/DB && bun run db:migrate"
                                depends_on:
                                    postgres:
                                        condition: "process_healthy"
                                availability:
                                    restart: "no"

                            apis:
                                command: "cd apps/APIs && bun --watch src/index.ts"
                                depends_on:
                                    migrate:
                                        condition: "process_completed_successfully"
                                    litellm:
                                        condition: "process_healthy"

                            web:
                                command: "cd apps/Web && bunx vite"
                        YAML

                        process-compose -f .devenv/process-compose/dev.yaml up
                    '';
                };
            in
            {
                devShells.default = pkgs.mkShell {
                    packages = [
                        pkgs.just
                        pkgs.bun
                        pkgs.process-compose
                        postgres
                        python
                        initDb
                        stopDb
                        devUp
                    ];

                    shellHook = ''
                        export POSTGRES_USER="${dbUser}"
                        export POSTGRES_PASSWORD="${dbPassword}"
                        export POSTGRES_DB="${dbName}"
                        export POSTGRES_PORT="${dbPort}"
                        export DATABASE_URL="postgresql://${dbUser}:${dbPassword}@127.0.0.1:${dbPort}/${dbName}"
                        export LITELLM_PROXY_BASE="http://127.0.0.1:${litellmPort}"
                        export BASE_URL="http://localhost:${apisPort}"
                        export CORS_ORIGIN="http://localhost:${webPort}"
                        export VITE_API_URL="http://localhost:${webPort}"
                        export VITE_PROXY_TARGET="http://localhost:${apisPort}"
                        export NODE_ENV="development"
                        export LOG_LEVEL="debug"
                    '';
                };

                packages.default = devUp;
                packages.dev-up = devUp;
                packages.init-db = initDb;
                packages.stop-db = stopDb;
            });
}
