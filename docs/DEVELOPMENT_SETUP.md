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
3. Runs `cmd/migrate`, which applies embedded Goose application migrations and River migrations.
4. Starts the Go API on port `8000` and waits for `/health`.
5. Starts the durable generation worker and waits for `/ready` on port `8080`.
6. Starts Bun's HTML dev server on port `5173`, with frontend bundling, Tailwind processing, static image routes, and hot module reloading.

The Bun server exposes only `VITE_*` variables to browser bundles. If
`VITE_API_URL` is absent during local development, browser API requests fall back
to port `8000` on the same loopback hostname.

The web entry stylesheet is `apps/web/styles.css`. It imports the shared UI
stylesheet, which is split into global styles in `libs/ui/styles/base.css` and
viewer styles in `libs/ui/styles/viewer.css`.

Stop the foreground process with `Ctrl+C`. Devenv stops managed services with the
development stack.

## Commands

Run these from the repository root inside `devenv shell`.

| Command | Action |
| --- | --- |
| `just dev` | Start PostgreSQL, migrations, API, generation worker, and web |
| `just api` | Start the Go API |
| `bun run dev:worker` | Start the durable generation worker |
| `just web` | Start Bun web server |
| `just db-shell` | Open a PostgreSQL shell |
| `just migrate` | Apply embedded Goose and River migrations |
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

## Project Structure

The active application is split into four workspace areas:

- `apps/api`: Go HTTP API, durable River worker, migration command, domain services, and integrations.
- `apps/web`: Browser application shell, router, and route-level screens.
- `libs/types`: Shared presentation, scene, and research types.
- `libs/ui`: Shared React components, hooks, UI contexts, and client-side helpers.

Web routes are grouped by domain under `apps/web/src/routes`: `auth`,
`presentations`, `marketplace`, `settings`, and `billing`. Application startup and
router infrastructure live under `apps/web/src/app`.

The former TypeScript API has been removed. `apps/api` is the only API
implementation and contains the application migration history and River migration
runner.

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

`apps/api/migrations` is the canonical embedded Goose application history.
River v0.43 maintains a separate migration history for its PostgreSQL queue
tables. Create an application migration with:

```bash
just db-generate add_example_table
```

Write the SQL, then apply it with `just migrate`. The script runs `cmd/migrate`,
which applies embedded Goose migrations first and River migrations second. The
migration runner applies all migrations to an empty database. If Goose history is
absent but the current Go API schema is already present, the wrapper records the
supported baseline before running the migration command.
The wrapper intentionally accepts only no arguments or `up`; application and
River migration histories must be advanced together.

Apply migrations before starting or deploying the API and worker. Production
images use the `migrate` target in `docker/Dockerfile.api` as a one-off migration
job; runtime startup does not apply schema changes.

## Local URLs

| Service | URL |
| --- | --- |
| Web | `http://localhost:5173` |
| API | `http://localhost:8000` |
| Health | `http://localhost:8000/health` |
| Worker liveness | `http://localhost:8080/live` |
| Worker readiness | `http://localhost:8080/ready` |
| PostgreSQL | `postgresql://slidesage:slidesage@127.0.0.1:$PGPORT/slidesage` |

Devenv may move PostgreSQL from `5432` when the port is occupied. Use the active
`PGPORT` for direct database commands.

## Mobile Layouts

The primary generation, research, presentation, marketplace, billing, and viewer
flows support phone-sized portrait viewports. Verify changes at 320px and 375px
wide in both normal and fullscreen viewer modes. Mobile controls reflow rather
than relying on horizontal page scrolling; fullscreen and iterate actions remain
reachable with touch input and safe-area padding.

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
- Worker exits or generation remains queued: inspect `devenv processes logs worker`, check `http://localhost:8080/ready`, and confirm PostgreSQL and provider configuration.
- Failed AI requests: confirm `OPEN_ROUTER_API_KEY` and `OPEN_ROUTER_MODEL`.
- Failed research: confirm `EXA_API_KEY`.
- Failed email: confirm `RESEND_API_KEY` and that `RESEND_FROM_EMAIL` is a valid
  address on a domain verified in Resend. Provider validation details are written
  to the API log, while clients receive a stable `503` response.
- Unexpected rate-limit responses: confirm migration `00012` is applied and inspect
  the API logs for `rate_limit_store_failed`.
