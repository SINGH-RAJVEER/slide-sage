set dotenv-load := true
set dotenv-path := ".env"
set shell := ["bash", "-cu"]

COMPOSE_DEV := "docker/dev/docker-compose.dev.yml"
COMPOSE_PROD := "docker/prod/docker-compose.prod.yml"

default:
  @just --list

# ---- Compose: dev ----
ddu:
  docker compose --env-file .env -f {{COMPOSE_DEV}} up --build

ddu-d:
  docker compose --env-file .env -f {{COMPOSE_DEV}} up -d --build

ddd:
  docker compose --env-file .env -f {{COMPOSE_DEV}} down

dev-reset:
  docker compose --env-file .env -f {{COMPOSE_DEV}} down -v --remove-orphans

dev-logs service="":
  docker compose --env-file .env -f {{COMPOSE_DEV}} logs -f {{service}}

# ---- Compose: prod ----
dpu:
  docker compose --env-file .env -f {{COMPOSE_PROD}} up -d --build

dpd:
  docker compose --env-file .env -f {{COMPOSE_PROD}} down

prod-logs service="":
  docker compose --env-file .env -f {{COMPOSE_PROD}} logs -f {{service}}

# ---- Validation ----
compose-config:
  docker compose --env-file .env -f {{COMPOSE_DEV}} config >/dev/null
  docker compose --env-file .env -f {{COMPOSE_PROD}} config >/dev/null
  echo "compose files parse cleanly"

# ---- Handy shells ----
db-shell:
  docker compose --env-file .env -f {{COMPOSE_DEV}} exec database psql -U "${POSTGRES_USER:-slidesage}" -d "${POSTGRES_DB:-slidesage}"

backend-shell:
  docker compose --env-file .env -f {{COMPOSE_DEV}} exec apis sh

frontend-shell:
  docker compose --env-file .env -f {{COMPOSE_DEV}} exec web sh
