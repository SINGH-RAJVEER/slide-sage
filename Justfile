# set dotenv-load
set dotenv-path := ".env"
set shell := ["bash", "-cu"]

default:
    @just --list

# ---- Dev ----

# Start all services and apps (postgres, litellm, apis, web)
dev:
    slidesage-dev-up

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
    cd apps/APIs && bun --watch src/index.ts

# Run the Web dev server only
web:
    cd apps/Web && bunx vite

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
