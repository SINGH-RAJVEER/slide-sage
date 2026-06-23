# Development Setup

Complete guide to setting up the SlideSage development environment.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Nix](https://nixos.org/download/) | 2.18+ | Package manager used by devenv |
| [devenv](https://devenv.sh/) | latest | Project development shell |

Bun, just, PostgreSQL, pgvector, process-compose, and LiteLLM are provided by
`devenv.nix` inside the development shell.

### Install devenv

```bash
nix profile install nixpkgs#devenv
```

### Enter the development shell

```bash
devenv shell
```

## Initial Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/slide-sage.git
cd slide-sage
```

### 2. Enter the devenv shell

Open the project development shell before running `just`, `bun`, database, or
service commands:

```bash
devenv shell
```

This evaluates `devenv.nix` and makes the repo-local commands available in your
current shell. The shell also sets local defaults for database and service URLs.

### 3. Install JavaScript dependencies

```bash
bun install
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials. `devenv shell` loads this file and also
injects a set of default values for local development (see `devenv.nix`), but
secrets such as API keys must still be provided in `.env`.

**Key variables:**

```bash
# Auth
AUTH_SECRET=change-me-in-production
BASE_URL=http://localhost:8000

# OAuth (optional for local work)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Email
RESEND_API_KEY=your-resend-key
RESEND_FROM_EMAIL=onboarding@yourdomain.com

# AI providers
GROQ_API_KEY=your-groq-key
GEMINI_API_KEY=your-gemini-key
OPENAI_API_KEY=
```

Database and service URL variables (`DATABASE_URL`, `LITELLM_PROXY_BASE`,
`POSTGRES_USER`, etc.) are set automatically by `devenv.nix` for local
development and do not need to be in `.env`.

## Starting the Development Environment

### All-in-one

```bash
just dev
```

This runs `slidesage-dev-up`, a Nix-provided script that starts all services in
a `process-compose` TUI:

| Process | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 | PostgreSQL 17 with pgvector |
| `litellm` | 4000 | LiteLLM proxy for AI model routing |
| `migrate` | - | Runs drizzle migrations (exits on completion) |
| `apis` | 8000 | Hono API server (hot-reload) |
| `web` | 5173 | Vite frontend dev server |

Startup ordering is enforced:
- `migrate` waits for `postgres` to be healthy
- `apis` waits for `migrate` to succeed and `litellm` to be healthy

Press `Ctrl+C` to stop all processes. PostgreSQL is stopped automatically when
`just dev` exits.

### Individual services

```bash
just apis    # API server only
just web     # Vite dev server only
```

## PostgreSQL

The database is managed by the Nix-provided `slidesage-init-db` and
`slidesage-stop-db` scripts. Its data lives in `.devenv/state/postgres/` and is
created automatically on first run.

The pgvector extension and the `slidesage` user/database are provisioned by
`slidesage-init-db`.

### Connect via psql

```bash
just db-shell
```

### Database operations

```bash
just migrate       # Run pending drizzle migrations
just db-generate   # Generate a new migration from schema changes
just db-push       # Push schema directly (no migration file)
just db-studio     # Open Drizzle Studio in the browser
```

### Reset the database

```bash
# Stop the dev environment first, then wipe the postgres state directory
rm -rf .devenv/state/postgres
just dev
```

## Justfile Reference

```
just dev          - Start all services (postgres + litellm + apis + web)
just apis         - Run the API server only
just web          - Run the Vite dev server only
just test         - Run all Bun test suites
just test-apis    - Run API tests only
just test-web     - Run Web tests only
just db-shell     - Open psql connected to the local database
just migrate      - Run drizzle-kit migrate
just db-generate  - Generate a drizzle migration
just db-push      - Push schema changes directly
just db-studio    - Open Drizzle Studio
just lint         - Run biome check
just lint-fix     - Run biome check --write
just format       - Run biome format --write
just install      - Run bun install
```

## Testing

Tests are first-class Bun test suites, not ad hoc scripts. Run them from the
repository root:

```bash
bun run test
```

Run one application at a time when iterating:

```bash
bun run test:apis
bun run test:web
```

The API tests mock external boundaries such as repositories and payment
secrets, so they do not require PostgreSQL, LiteLLM, Razorpay, or provider API
keys. They run with Bun's `--isolate` flag so file-local route mocks do not
leak across test files. The Web tests use happy-dom through
`apps/Web/bunfig.toml`.

## Troubleshooting

### `just`, `bun`, or `slidesage-dev-up` is missing

Enter the devenv shell from the repository root:

```bash
devenv shell
```

### Port already in use

Find and stop the conflicting process:

```bash
lsof -i :8000   # APIs
lsof -i :5173   # Web
lsof -i :5432   # Postgres
lsof -i :4000   # LiteLLM
kill -9 <PID>
```

### Database fails to start / corrupt state

Wipe the local postgres state and restart:

```bash
rm -rf .devenv/state/postgres
just dev
```

### LiteLLM fails to start

Ensure `GROQ_API_KEY` (and optionally `GEMINI_API_KEY`) are set in `.env`.
LiteLLM reads them from the environment at startup via the `os.environ/` prefix
in `litellm_config.yaml`.

### Dependency installation failed

```bash
rm -rf node_modules
bun install

# Clear Bun cache if needed
bun pm cache rm
bun install
```

## Next Steps

- Read [MONOREPO_STRUCTURE.md](MONOREPO_STRUCTURE.md) for the project layout.
- Read [REQUEST_FLOWS.md](REQUEST_FLOWS.md) for end-to-end flow diagrams.
- Read [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for a full variable reference.
