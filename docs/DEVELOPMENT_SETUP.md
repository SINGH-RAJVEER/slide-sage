# Development Setup

Complete guide to setting up the SlideSage development environment.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Nix](https://nixos.org/download/) | 2.18+ | Package management for the dev shell |
| [direnv](https://direnv.net/) | 2.x+ | Automatic shell activation on `cd` |
| [nix-direnv](https://github.com/nix-community/nix-direnv) | any | `use flake` support for direnv |

Bun, just, PostgreSQL, pgvector, process-compose, and LiteLLM are provided by
`flake.nix` inside the development shell.

### Install direnv and nix-direnv

```bash
# Install direnv and nix-direnv into your user profile
nix profile install nixpkgs#direnv nixpkgs#nix-direnv

# Hook direnv into your shell (add to ~/.bashrc or ~/.zshrc)
eval "$(direnv hook bash)"
# or
eval "$(direnv hook zsh)"
```

## Initial Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/slide-sage.git
cd slide-sage
```

### 2. Allow direnv

On first entry into the project directory, direnv will ask for permission:

```bash
direnv allow
```

This evaluates `.envrc`, which uses the local `flake.nix` to load the full
development shell into the current shell session. Subsequent `cd` invocations
into the project will activate the environment automatically.

If you do not use direnv, enter the shell manually:

```bash
nix develop
```

### 3. Install JavaScript dependencies

```bash
bun install
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials. The Nix shell also injects a set of default
values for local development (see `flake.nix`), but secrets such as API keys
must still be provided in `.env`.

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
`POSTGRES_USER`, etc.) are set automatically by `flake.nix` for local
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

## Troubleshooting

### direnv does not activate

Make sure the direnv shell hook is configured and `nix-direnv` is installed.
Then run:

```bash
direnv allow .
```

### `use flake` is unknown

Install `nix-direnv`:

```bash
nix profile install nixpkgs#nix-direnv
```

Then open a new shell or reload your shell configuration and run:

```bash
direnv allow .
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
