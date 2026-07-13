# set dotenv-load
set dotenv-path := ".env"
set shell := ["bash", "-cu"]

default:
    @just --list

# ---- Dev ----

# Start all services and apps (postgres, apis, web)
dev:
    devenv shell slidesage-dev-up

# Start the API and Web development servers in parallel
apps:
    #!/usr/bin/env bash
    set -euo pipefail
    set -m
    pids=()
    cleanup() {
        trap - EXIT INT TERM
        for pid in "${pids[@]}"; do
            kill -- "-$pid" 2>/dev/null || true
        done
        wait "${pids[@]}" 2>/dev/null || true
    }
    trap cleanup EXIT INT TERM
    bun --cwd apps/APIs dev &
    pids+=("$!")
    bun --cwd apps/Web dev &
    pids+=("$!")
    wait -n "${pids[@]}"

# ---- Database ----

# Open a psql shell to the local dev database
db-shell:
    psql -h 127.0.0.1 -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-slidesage}" -d "${POSTGRES_DB:-slidesage}"

# Run drizzle-kit migrations
migrate:
    cd packages/database && bun run db:migrate

# Generate a new drizzle migration from schema changes
db-generate:
    cd packages/database && bun run db:generate

# Push schema changes directly (no migration file)
db-push:
    cd packages/database && bun run db:push

# Open drizzle studio
db-studio:
    cd packages/database && bun run db:studio

# ---- Apps ----

# Run the API server only
apis:
    bun --cwd apps/APIs dev

# Run the Web dev server only
web:
    bun --cwd apps/Web dev

# ---- Code quality ----

test:
    bun run test

test-apis:
    bun run test:apis

test-web:
    bun run test:web

lint:
    bun run biome check .

lint-fix:
    bun run biome check --write .

format:
    bun run biome format --write .

# ---- Install ----

install:
    bun install
