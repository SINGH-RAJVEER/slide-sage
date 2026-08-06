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
4. Starts the Go API on port `8000` and waits for `/health`.
5. Starts Bun's HTML dev server on port `5173`, with frontend bundling, Tailwind processing, static image routes, and hot module reloading.

The Bun server exposes only `VITE_*` variables to browser bundles. If
`VITE_API_URL` is absent during local development, browser API requests fall back
to port `8000` on the same loopback hostname.

Stop the foreground process with `Ctrl+C`. Devenv stops managed services with the
development stack.

## Commands

Run these from the repository root inside `devenv shell`.

| Command | Action |
| --- | --- |
| `just dev` | Start PostgreSQL, migrations, API, and web |
| `just api` | Start the Go API |
| `just web` | Start Bun web server |
| `just db-shell` | Open a PostgreSQL shell |
| `just migrate` | Apply Goose migrations |
| `just db-generate <name>` | Create a Goose SQL migration |
| `just test` | Run all tests |
| `just test-api` | Run Go API tests |
| `just test-web` | Run web tests |
| `just test-ui` | Run shared UI tests |
| `just lint` | Run Go vet and Biome checks |
| `just format` | Format the repository |
| `bun run load-test --help` | Show API load-test options |

The repository uses a Go module for `apps/api` and a Bun workspace for the web,
shared types, and UI packages. It does not use a separate monorepo task runner.

## API Load Testing

The dependency-free load test sends bounded concurrent `GET` requests and reports
throughput, status counts, response errors, and p50/p95/p99 latency. It targets the
production `/health` route by default, so it does not create application data.
Every non-loopback target requires explicit production confirmation:

```bash
bun run load-test --confirm-production
```

The default run uses 100 concurrent workers, targets 500 requests per second for
30 seconds, and fails when more than 1% of requests fail. Increase the rate and
duration deliberately after confirming that Cloud Run scaling and cost limits are
appropriate:

```bash
bun run load-test --confirm-production --concurrency 250 --rps 2000 --duration 120
```

Use `--rps 0` for the maximum throughput allowed by the selected concurrency. Add
`--p95-ms 1000` to enforce a latency threshold. Test configuration without sending
requests by using a loopback URL with `--dry-run`:

```bash
bun run load-test --url http://localhost:8000/health --dry-run
```

Only load-test infrastructure you own or are authorized to test. Production tests
can increase Cloud Run and downstream service costs.

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
| Health | `http://localhost:8000/health` |
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
- Failed email: confirm `RESEND_API_KEY` and that `RESEND_FROM_EMAIL` is a valid
  address on a domain verified in Resend. Provider validation details are written
  to the API log, while clients receive a stable `503` response.
- Unexpected rate-limit responses: confirm migration `00012` is applied and inspect
  the API logs for `rate_limit_store_failed`.
