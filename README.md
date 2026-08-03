# SlideSage

SlideSage is an AI-assisted presentation builder. It generates, researches, revises, stores, previews, and exports slide decks from a React web application.

---

## Features

- Streaming presentation generation and revision
- Web research with cited sources
- Semantic memory for slide, deck, style, feedback, and source context
- PPTX and PDF export

## Local Development

Requirements: Nix with [devenv](https://devenv.sh/getting-started/) installed. Devenv supplies Go, Bun, PostgreSQL, and `just`.

```bash
cp .env.example .env
devenv shell
bun install
just dev
```

Set `AUTH_SECRET` and `OPEN_ROUTER_API_KEY` in `.env` before starting. Add `EXA_API_KEY` for web research, `RESEND_API_KEY` for email delivery, OAuth credentials for social sign-in, and Razorpay credentials for purchases.

`just dev` starts PostgreSQL with pgvector, applies the Goose migrations, waits for the Go API health check, and then starts:

- Web: http://localhost:5173
- API: http://localhost:8000

The local database lives in `.devenv/state/postgres/`.

## Commands


| Command | Purpose |
| --- | --- |
| `just dev` | Start PostgreSQL, migrations, API, and web app |
| `just api` | Start only the API |
| `just web` | Start only the web app |
| `just migrate` | Apply database migrations |
| `just db-generate <name>` | Create a Goose migration |
| `just test` | Run Go API, web, and shared library tests |
| `just lint` | Run Go vet and Biome checks |
| `just format` | Format the repository |
| `bun run build` | Build the web application with Bun and Vite |

## Repository

```text
apps/
    api/        Go API, Goose migrations, repositories, and provider integrations
    web/        React and Vite web application
libs/
    types/      Shared TypeScript contracts
    ui/         Shared React UI primitives
docs/           Maintainer documentation
devenv.nix      Local toolchain and service orchestration
Justfile        Common development commands
```

The application uses Go for the API and Bun for the web workspace. It also uses PostgreSQL with pgvector, OpenRouter, Exa, Resend, and Razorpay.

## Documentation

- [Development setup](docs/DEVELOPMENT_SETUP.md)
- [Environment variables](docs/ENVIRONMENT_VARIABLES.md)
- [Architecture](docs/API_ARCHITECTURE.md)
- [API reference](docs/API_OVERVIEW.md)
- [Authentication](docs/AUTH_API.md)
- [RAG and semantic memory](docs/RAG_IMPLEMENTATION.md)
