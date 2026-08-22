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

# Apply Go API migrations
migrate:
    CGO_ENABLED=0 go -C apps/api run ./cmd/migrate

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
    bun run lint

lint-fix:
    bunx biome check --write .

format:
    bun run format

docker-build:
	docker build --target api --file docker/Dockerfile.api --tag slidesage-api .

docker-worker:
	docker build --target worker --file docker/Dockerfile.api --tag slidesage-worker .

docker-migrate:
	docker build --target migrate --file docker/Dockerfile.api --tag slidesage-migrate .
