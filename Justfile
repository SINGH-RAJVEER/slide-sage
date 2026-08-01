set dotenv-path := ".env"
set shell := ["bash", "-cu"]

default:
    @just --list

# Start all services and apps
dev:
    devenv up

# Open a psql shell to the local dev database
db-shell:
    psql -h 127.0.0.1 -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-slidesage}" -d "${POSTGRES_DB:-slidesage}"

# Run drizzle-kit migrations
migrate:
    cd apps/api && bun run db:migrate

# Generate a new drizzle migration from schema changes
db-generate:
    cd apps/api && bun run db:generate

# Push schema changes directly
db-push:
    cd apps/api && bun run db:push

# Open drizzle studio
db-studio:
    cd apps/api && bun run db:studio

# Run the API server only
api:
    bun --cwd apps/api dev

# Run the Web dev server only
web:
    bun --cwd apps/web dev

test:
    bun run test

test-api:
    bun run test:api

test-web:
    bun run test:web

test-ui:
    bun run test:ui

lint:
    bun run biome check .

lint-fix:
    bun run biome check --write .

format:
    bun run biome format --write .
