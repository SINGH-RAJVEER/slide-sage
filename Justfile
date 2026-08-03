set dotenv-path := ".env"
set shell := ["bash", "-cu"]

default:
    @just --list

# Start all services and apps
dev:
    devenv up

# Open a psql shell to the local dev database
db-shell:
    psql -h 127.0.0.1 -p "${PGPORT:-${POSTGRES_PORT:-5432}}" -U "${POSTGRES_USER:-slidesage}" -d "${POSTGRES_DB:-slidesage}"

# Apply Go API migrations with Goose
migrate:
    bash apps/api/scripts/migrate.sh

# Create a new Goose SQL migration
db-generate name:
    goose -dir apps/api/migrations create "{{name}}" sql

# Run the API server only
api:
    bun run dev:api

# Run the Web server only
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
