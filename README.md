# SlideSage

SlideSage is an AI-assisted presentation builder. It generates, researches, revises, stores, previews, and exports slide decks from a React web application.

## Features

- Streaming presentation generation and revision
- Optional web research with cited sources
- Semantic memory for slide, deck, style, feedback, and source context
- Email/password, email OTP, Google, and GitHub authentication
- Saved presentation library and PDF export
- Slide-token billing through Razorpay

## Local Development

Requirements: Nix with [devenv](https://devenv.sh/getting-started/) installed.

```bash
cp .env.example .env
devenv shell
bun install
just dev
```

Set `AUTH_SECRET` and `OPEN_ROUTER_API_KEY` in `.env` before starting. Add `EXA_API_KEY` for web research, `RESEND_API_KEY` for email delivery, OAuth credentials for social sign-in, and Razorpay credentials for purchases.

`just dev` starts PostgreSQL with pgvector, applies Drizzle migrations, and runs:

- Web: http://localhost:5173
- API: http://localhost:8000
- Health check: http://localhost:8000/

The local database lives in `.devenv/state/postgres/`.

## Commands

Run commands inside `devenv shell`.

| Command | Purpose |
| --- | --- |
| `just dev` | Start PostgreSQL, migrations, API, and web app |
| `just docker` | Build and start the production Docker stack |
| `just apis` | Start only the API |
| `just web` | Start only the web app |
| `just migrate` | Apply database migrations |
| `just db-generate` | Generate a Drizzle migration |
| `just db-studio` | Open Drizzle Studio |
| `just test` | Run API, web, and shared type tests |
| `just lint` | Run Biome checks |
| `just format` | Format the repository |
| `bun run build` | Build the web application with Bun and Vite |

## Repository

```text
apps/
    api/        Hono API, database, migrations, and application services
    web/        React and Vite web application
libs/
    types/      Shared TypeScript contracts
    ui/         Shared React UI primitives
docs/           Maintainer documentation
devenv.nix      Local toolchain and service orchestration
Justfile        Common development commands
```

The workspace uses Bun, TypeScript, Biome, PostgreSQL 18 with pgvector, OpenRouter, Exa, Better Auth, Resend, and Razorpay.

## Documentation

- [Development setup](docs/DEVELOPMENT_SETUP.md)
- [Production Docker deployment](docs/DOCKER_DEPLOYMENT.md)
- [Environment variables](docs/ENVIRONMENT_VARIABLES.md)
- [Architecture](docs/API_ARCHITECTURE.md)
- [API reference](docs/API_OVERVIEW.md)
- [Authentication](docs/AUTH_API.md)
- [RAG and semantic memory](docs/RAG_IMPLEMENTATION.md)
