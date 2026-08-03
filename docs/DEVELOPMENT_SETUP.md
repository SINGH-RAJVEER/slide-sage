# Development Setup

## Requirements

Install Nix with [devenv](https://devenv.sh/getting-started/). The environment
provides Go, Bun, PostgreSQL, Goose, Clang, and `just`.

```bash
cp .env.example .env
devenv shell
bun install
just dev
```

Set `AUTH_SECRET` and `OPEN_ROUTER_API_KEY` in `.env`. Add `EXA_API_KEY` for
research, `RESEND_API_KEY` for email delivery, OAuth credentials for social sign-in,
and Razorpay credentials for purchases.

## Startup

`just dev`:

1. Starts devenv PostgreSQL with pgvector.
2. Ensures the local role, database, and vector extension exist.
3. Applies `apps/api/migrations` with Goose.
4. Starts the Go API on port `8000` and waits for `/api/health`.
5. Starts Vite on port `5173`.

Stop the foreground process with `Ctrl+C`. Devenv stops managed services with the
development stack.

## Commands

Run these from the repository root inside `devenv shell`.

| Command | Action |
| --- | --- |
| `just dev` | Start PostgreSQL, migrations, API, and web |
| `just api` | Start the Go API |
| `just web` | Start Vite |
| `just db-shell` | Open a PostgreSQL shell |
| `just migrate` | Apply Goose migrations |
| `just db-generate <name>` | Create a Goose SQL migration |
| `just test` | Run all tests |
| `just test-api` | Run Go API tests |
| `just test-web` | Run web tests |
| `just test-ui` | Run shared UI tests |
| `just lint` | Run Go vet and Biome checks |
| `just format` | Format the repository |

The repository uses a Go module for `apps/api` and a Bun workspace for the web,
shared types, and UI packages. It does not use a separate monorepo task runner.

## Database Migrations

`apps/api/migrations` is the canonical Goose history. Create a migration with:

```bash
just db-generate add_example_table
```

Write the SQL, then apply it with `just migrate`. The migration runner applies all
migrations to an empty database. If Goose history is absent but the current Go API
schema is already present, it records version 13 as the baseline without replaying
historical schema changes.

## Local URLs

| Service | URL |
| --- | --- |
| Web | `http://localhost:5173` |
| API | `http://localhost:8000` |
| Health | `http://localhost:8000/api/health` |
| PostgreSQL | `postgresql://slidesage:slidesage@127.0.0.1:$PGPORT/slidesage` |

Devenv may move PostgreSQL from `5432` when the port is occupied. Use the active
`PGPORT` for direct database commands.

## Reset PostgreSQL

This permanently deletes local development data:

```bash
devenv processes down
rm -rf .devenv/state/postgres
just dev
```

## Troubleshooting

- Missing tools: enter `devenv shell` first.
- Port collision: use the active `PGPORT`, or stop the process using `5173` or `8000`.
- API exits: inspect `devenv processes logs api` and confirm the configured Go toolchain.
- Failed AI requests: confirm `OPEN_ROUTER_API_KEY` and `OPEN_ROUTER_MODEL`.
- Failed research: confirm `EXA_API_KEY`.
- Failed email: confirm `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
- Unexpected rate-limit responses: confirm migration `00012` is applied and inspect
  the API logs for `rate_limit_store_failed`.
