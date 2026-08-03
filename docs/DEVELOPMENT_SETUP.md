# Development Setup

## Requirements

- Nix with flakes enabled
- [devenv](https://devenv.sh/getting-started/)

Go, Bun, PostgreSQL 18 with pgvector, and `just` are supplied by `devenv.nix`.

## First Run

```bash
cp .env.example .env
devenv shell
bun install
just dev
```

At minimum, replace `AUTH_SECRET` and set `OPEN_ROUTER_API_KEY` in `.env`.
See [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for optional services.
The Go auth implementation is part of `apps/api`; there is no separate auth
package to build or deploy.

`just dev` performs the complete startup sequence:

1. Starts devenv's PostgreSQL service under `.devenv/state/postgres/`.
2. Ensures the `slidesage` role, database, and `vector` extension exist.
3. Applies Goose migrations after PostgreSQL is ready.
4. Starts the Go API on port `8000` and waits for `/api/health`.
5. Starts Vite on port `5173` after the Go API is ready.

The hardened API requires migrations `00011_generation_point_operations.sql` and
`00012_api_rate_limits.sql`. Do not deploy the API before its target database has
both migrations; protected requests fail closed when rate-limit storage is
unavailable.

Stop the foreground process with `Ctrl+C`. Devenv stops the managed PostgreSQL
instance with the API and web processes.

## Common Commands

Run these from the repository root inside `devenv shell`.

| Command | Action |
| --- | --- |
| `just dev` | Start the complete development stack |
| `just api` | Start the Go API |
| `just api-legacy` | Start the legacy TypeScript API with watch mode |
| `just web` | Start Vite |
| `just db-shell` | Connect to the local database with `psql` |
| `just migrate` | Apply committed migrations |
| `just db-generate <name>` | Create a Goose SQL migration |
| `just db-studio` | Start Drizzle Studio |
| `just test` | Run all tests |
| `just test-api` | Run the Go API tests |
| `just test-api-legacy` | Run isolated legacy API tests |
| `just test-web` | Run web tests |
| `just test-ui` | Run shared UI tests |
| `just lint` | Run Biome checks |
| `just lint-fix` | Apply safe Biome fixes |
| `just format` | Format the repository |

The repository uses a Go module for `apps/api` and a Bun workspace for TypeScript packages. Root Bun scripts orchestrate both toolchains without a separate monorepo task runner.

## Database Migrations

`apps/api/migrations` is the canonical migration history. Goose applies it through
`just migrate`, `bun run migrate:api`, or the managed `db:migrate` task used by
`just dev`. Create a migration with a descriptive name, then write its SQL:

```bash
just db-generate add_example_table
```

Keep `apps/api-legacy/src/db/schema.ts` and its domain modules synchronized when a
schema change affects Drizzle Studio or the retained Worker, but do not generate or
apply migrations from `apps/api-legacy`.

When Goose history is absent, the migration runner checks only the current Go API
schema. A database containing the baseline API tables and the presentation revision
column is recorded at Goose version 13 without replaying migrations. An empty
database receives the complete migration sequence normally; legacy migration
metadata is not read or required.
Fresh deployment databases must have the pgvector extension available and allow
`CREATE EXTENSION vector` before the remaining migrations run; local `db:setup`
handles this automatically.

## API Test Boundaries

`just test-api` runs `go test ./...` for the primary API. The suite covers password and signed-cookie compatibility, OAuth state, request normalization, point estimates, presentation schema normalization, provider responses, billing signatures, CORS, and rate-limit policies.

`just test-api-legacy` runs `bun test --isolate` for the retained Worker. Isolation is required
because auth and database modules hold process state. The suite covers route
validation and statuses, password compatibility, OTP replacement behavior,
request logging, rate-limit response behavior, point-accounting branches,
Razorpay verification rules, provider parsing, cancellation, and stream retry
logic primarily through module mocks, fake stores, and mocked `fetch` or SDK
clients. Database-context tests verify async request isolation and delayed Worker
client closure without opening a PostgreSQL connection.

Run `bun run build:api` to compile all Go API packages. Use `bun run build:api-legacy` to dry-build the Worker without deploying it. Run the legacy opt-in PostgreSQL suite with
`TEST_DATABASE_URL=postgresql://..._test bun run test:integration:db:api-legacy`. The
database name must contain `test`; the suite applies migrations, creates
temporary records, and verifies concurrent credits/deductions, atomic
rate-limit increments, and one-time expired-reservation recovery.

These tests do not replace the following external verification:

- Live PostgreSQL tests beyond the opt-in accounting suite, especially payment
  fulfillment, ownership checks, settlement rollback, and long-running SSE
  connection behavior.
- Provider or sandbox tests for Better Auth and Resend delivery, Exa cancellation,
  OpenRouter and BYOK structured output, and Razorpay order, payment-fetch, and
  webhook flows.
- A staging Worker test using the deployed database path, and Hyperdrive when
  configured, to verify per-request connection closure after SSE completion or
  cancellation.
- Staging proxy/browser tests for client-IP forwarding, `429` and `Retry-After`,
  credentialed `PATCH` preflights, cookies, body-size rejection, and webhook
  retries.

Run and record those checks separately for a release. A passing Bun suite is not
evidence that live PostgreSQL, external providers, Hyperdrive, or staging routing
were exercised.

All reusable React UI lives in `libs/ui`. Import feature components through
`@slidesage/ui`, `@slidesage/ui/components/Generate`,
`@slidesage/ui/components/Presentations`, or
`@slidesage/ui/components/Viewer`. The web app keeps only connected adapters
under `apps/web/src/modules` for routing, authentication, API calls, browser
storage, notifications, and file export. UI components must not import the
web app's `@/` alias. Tailwind scans the complete `libs/ui` package from
`apps/web/src/globals.css`, including class names defined by rendering helpers.

Tests follow the same ownership boundary. Component behavior, rendering security,
editing helpers, and presentation layout tests live under `libs/ui/test` and run
with Bun plus Happy DOM. Tests under `apps/web/src/test` cover routing, API adapters,
browser services, hooks, contexts, and page integration. Do not add tests that only
assert native element behavior, child rendering, or exact utility-class lists.

| Command | Action |
| --- | --- |
| `bun run dev` | Run the complete `just dev` development stack |
| `bun run build` | Build the web application |
| `bun run build:api` | Compile the Go API packages |
| `bun run build:api-legacy` | Dry-build the legacy Cloudflare Worker |
| `bun run deploy:api-legacy` | Deploy the legacy API with Wrangler |
| `bun run test` | Run API, shared types, UI, and web tests |
| `bun run test:integration:db:api-legacy` | Run the legacy opt-in suite against `TEST_DATABASE_URL` |
| `bun run test:ui` | Run shared UI component and rendering tests |
| `bun run type-check` | Type-check all workspace projects |
| `bun run lint` | Lint every workspace package |
| `bun run format` | Format every workspace package |

## Local URLs

| Service | URL |
| --- | --- |
| Web application | `http://localhost:5173` |
| API | `http://localhost:8000` |
| Health check | `http://localhost:8000/api/health` |
| PostgreSQL | `postgresql://slidesage:slidesage@127.0.0.1:$PGPORT/slidesage` |

Vite proxies API requests to port `8000`. `VITE_API_URL` therefore defaults to
the web origin during the all-in-one devenv workflow.

Full-screen route, session, and presentation loading states, including the
router hydration fallback, use `libs/ui/components/loading-screen.tsx` and the standard
shadcn spinner in `libs/ui/components/spinner.tsx` through the `@slidesage/ui` package.
The full-screen spinner uses the same solid white foreground as the rest of the
application.

The presentation viewer switches to a touch-first layout whenever the viewport
is portrait-oriented. This layout uses a compact two-row header, a full-width
slide stage, swipeable thumbnails, and a safe-area-aware bottom navigation bar.
Landscape viewports retain the desktop viewer, including landscape phones and
tablets. Test both orientations when changing viewer controls or slide sizing.
Saved presentations and marketplace previews share controlled held-key navigation:
arrow keys and J/L move once immediately, then repeat at the bounded viewer rate.

On the active viewer, the current pipeline message and stage progress appear
inside the first-slide loader rather than in a separate bar. After navigation
away from that viewer, the same status is shown as a compact fixed icon. Hovering
it or moving keyboard focus to it expands the indicator to reveal its title,
detail, progress, and destination action. The complete accessible label remains
on the collapsed button for assistive technology and touch activation. Generation
actions may request browser notification permission; when granted, a hidden tab
receives one clickable notification after the presentation is saved.

The application header renders user initials rather than loading third-party OAuth
avatar URLs. This avoids cross-origin image blocking and keeps account navigation
available when an identity provider image is unavailable.

The account dropdown links to `/settings`, where users manage encrypted provider
keys and their default generation model. With no valid connection, generation
uses the server OpenRouter model and consumes SlideSage points.

The workspace uses the native TypeScript 7 compiler pinned in the root package.
Run `bun run type-check` to check the API, web app, shared types library, and UI
library with their project-specific configurations.

## Resetting PostgreSQL

This permanently deletes local development data:

```bash
devenv processes down
rm -rf .devenv/state/postgres
```

Run `just dev` to initialize it again.

## Upgrading Local PostgreSQL 17 Data

PostgreSQL major versions cannot open each other's data directories. If the local
PostgreSQL 17 database contains data you need, export it before entering the updated
development environment:

```bash
devenv up -d postgres
pg_dump -h 127.0.0.1 -p "${PGPORT:-5432}" -U slidesage -d slidesage --format=custom --file=slidesage-pg17.dump
devenv processes down
```

After updating, initialize PostgreSQL 18 and restore the dump:

```bash
devenv processes down
rm -rf .devenv/state/postgres
devenv up -d postgres
devenv tasks run db:setup
pg_restore -h 127.0.0.1 -p "${PGPORT:-5432}" -U slidesage -d slidesage --clean --if-exists --no-owner slidesage-pg17.dump
devenv tasks run db:migrate
devenv processes down
just dev
```

Keep the dump until the restored application and vector searches have been
verified. If the local database is disposable, use the reset procedure above
instead.

## Troubleshooting

- Missing `bun`, `just`, or PostgreSQL commands: enter `devenv shell` first.
- Port collision: stop the existing process on `5173` or `8000`, or override the
  relevant environment variable. Devenv may move PostgreSQL from `5432`; use its
  active `PGPORT` for direct database commands.
- API exits immediately under `just dev`: ensure `apps/api/go.mod` does not require
  a newer Go patch release than the toolchain reported by `devenv info`, and inspect
  `devenv processes logs api`.
- Failed AI requests: confirm `OPEN_ROUTER_API_KEY` and the configured model.
- Failed research: set `EXA_API_KEY`; research is skipped when it is absent.
- Failed email delivery: set `RESEND_API_KEY`; development without it skips
  delivery and logs only a warning, never the OTP value.
- Unexpected rate-limit `503` responses: confirm migration `00012` is applied and
  inspect `rate_limit_store_failed`; protected requests fail closed on PostgreSQL
  errors.

The generation page sends one prompt string to the presentation pipeline. Its centered
compact editor grows to a bounded height and generates on Enter. The expand control
appears only after the compact editor begins scrolling. Expanding morphs that same
textarea border toward the viewport margins, stopping below the generation estimate,
without adding a surrounding panel. The same Generate action moves to the textarea's
lower-right corner. The expanded editor supports multiline writing and generates on
Shift+Enter. Commas and line breaks remain part of the prompt rather than creating
separate topics. The generation estimate appears below the selectors bar once the prompt
contains text without changing the centered composer's position. Expanded bounds use the
visual viewport so transformed layout containers and mobile browser chrome do not reduce
the editor's intended width or height.

The repository uses `devenv shell` directly. It does not require direnv,
`.envrc`, or `.direnv/`.
