# Development Setup

## Requirements

- Nix with flakes enabled
- [devenv](https://devenv.sh/getting-started/)

Bun, PostgreSQL 17 with pgvector, process-compose, and `just` are supplied by
`devenv.nix`.

## First Run

```bash
cp .env.example .env
devenv shell
bun install
just dev
```

At minimum, replace `AUTH_SECRET` and set `OPEN_ROUTER_API_KEY` in `.env`.
See [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for optional services.
The auth implementation is part of `apps/APIs`; there is no separate auth
package to build or deploy.

`just dev` performs the complete startup sequence:

1. Initializes PostgreSQL under `.devenv/state/postgres/` when needed.
2. Creates the `slidesage` role, database, and `vector` extension.
3. Applies Drizzle migrations.
4. Starts the API on port `8000` and Vite on port `5173`.

Stop the foreground process with `Ctrl+C`. The process trap stops the local
PostgreSQL instance.

## Common Commands

Run these from the repository root inside `devenv shell`.

| Command | Action |
| --- | --- |
| `just dev` | Start the complete development stack |
| `just apis` | Start the API with watch mode |
| `just web` | Start Vite |
| `just db-shell` | Connect to the local database with `psql` |
| `just migrate` | Apply committed migrations |
| `just db-generate` | Generate a migration from schema changes |
| `just db-push` | Push schema changes without a migration file |
| `just db-studio` | Start Drizzle Studio |
| `just test` | Run all tests |
| `just test-apis` | Run isolated API tests |
| `just test-web` | Run web tests |
| `just lint` | Run Biome checks |
| `just lint-fix` | Apply safe Biome fixes |
| `just format` | Format the repository |

Root Bun scripts also expose Nx tasks such as `bun run build`, `bun run dev`,
and app-specific build, test, lint, and format commands.

## Local URLs

| Service | URL |
| --- | --- |
| Web application | `http://localhost:5173` |
| API | `http://localhost:8000` |
| Health check | `http://localhost:8000/` |
| PostgreSQL | `postgresql://slidesage:slidesage@127.0.0.1:5432/slidesage` |

Vite proxies API requests to port `8000`. `VITE_API_URL` therefore defaults to
the web origin during the all-in-one devenv workflow.

## Resetting PostgreSQL

This permanently deletes local development data:

```bash
slidesage-stop-db
rm -rf .devenv/state/postgres
```

Run `just dev` to initialize it again.

## Troubleshooting

- Missing `bun`, `just`, or PostgreSQL commands: enter `devenv shell` first.
- Port collision: stop the existing process on `5173`, `8000`, or `5432`, or
  override the relevant environment variable.
- Failed AI requests: confirm `OPEN_ROUTER_API_KEY` and the configured model.
- Failed research: set `EXA_API_KEY`; research is skipped when it is absent.
- Failed email delivery: set `RESEND_API_KEY`; development mode logs OTPs when
  the key is absent.

The repository uses `devenv shell` directly. It does not require direnv,
`.envrc`, or `.direnv/`.
