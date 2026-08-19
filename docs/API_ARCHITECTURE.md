# Architecture

## Workspace

SlideSage consists of a Go API, a durable Go generation worker, a React web
application, shared TypeScript contracts, and shared UI components.

```text
apps/api   Go API, River generation worker, migrations, repositories, providers
apps/web   React application developed and bundled with Vite
libs/types Shared API and presentation contracts
libs/ui    Shared React UI primitives and slide renderer
```

The Go API is the only application HTTP API. It owns authentication and JWT
tokens, presentations, research submission, generation submission and event delivery,
billing, BYOK connections, rate limiting, and PostgreSQL persistence. The
generation worker owns queued AI provider execution.

## Runtime

The local stack is coordinated by devenv:

```text
PostgreSQL ready -> Goose and River migrations complete -> API and worker ready -> Vite web ready
```

The API entry point is `apps/api/cmd/api/main.go`. It exposes:

- `/health`
- `/auth`
- `/profile`
- `/ai`
- `/presentations`
- `/research-presentation`
- `/generate-presentation-stream`
- `/iterate-presentation-stream`
- `/generation-jobs/{id}`
- `/generation-jobs/{id}/events`
- `/generation-jobs/{id}/cancel`
- `/billing`

The worker entry point is `apps/api/cmd/worker/main.go`. It consumes River v0.43
jobs from PostgreSQL, executes generation and iteration, and exposes `/live` and
`/ready` on its health port. API-to-worker communication is PostgreSQL-only.

The API and worker use `database/sql` with PostgreSQL and pgvector. The migration
entry point, `apps/api/cmd/migrate/main.go`, applies embedded Goose migrations
from `apps/api/migrations` and then River's migrations. Migrations must complete
before either runtime starts.

## Generation

Generation validates the request and performs a durable handoff before opening
an SSE stream. One transaction reserves points, creates or updates the generating
presentation state, creates the `generation_jobs` record and initial
`generation_job_events`, and inserts the River queue job with `InsertTx`. The API
then tails persisted events; a client or API stream disconnect does not stop the
queued work.

The worker resolves the server OpenRouter model or encrypted user provider
connection, calls the provider, and normalizes output to a bounded schema-v5
presentation document. Output without substantive content is rejected.
Successful generation settles the point reservation and persists the final
document transactionally. Provider, validation, cancellation, and save failures
finalize the operation and refund its active reservation transactionally.

River retries mean external provider execution is at-least-once. A provider can
receive the same work more than once after an interruption, while operation
status and ledger transactions ensure SlideSage settles or refunds the point
reservation only once. See [GENERATION_WORKER.md](GENERATION_WORKER.md).

Research preview uses Exa. Reviewed sources can be attached to generation and are
persisted with the presentation for attribution.

## Authentication

Authentication is implemented in `apps/api/internal/auth`. The API supports
email/password accounts, email verification OTPs, password reset OTPs, Google and
GitHub OAuth, HTTP-only JWT cookies, sign-out, and authenticated
profile security changes.

## Presentation Documents

Presentation contracts shared with the web application live in `libs/types`.
Schema-v5 content slides use bounded layouts, tones, densities, patterns, regions,
and block types. The Go normalizer validates and limits provider and user-authored
documents before persistence and rendering.

The web renderer displays content, chart, and scene slides. The viewer exports
editable PowerPoint files from the presentation model and captures fixed-size
rendered slides for PDF output.

## Persistence

Repositories in `apps/api/internal` own SQL access. Route handlers validate HTTP
input and translate service results; authentication, generation, research, AI
provider, billing, and presentation logic remain in their respective packages.

Point reservations use `generation_point_operations`. Reservation, final save,
settlement, and refund paths use transactions and compare-and-swap revisions to
prevent concurrent generation from overwriting a presentation.

Migration `00015_add_generation_jobs.sql` adds the application job and event
tables. River owns separate queue tables managed by `cmd/migrate`; queue rows are
not the source of truth for user-visible job status or events.

## Deployment

`docker/Dockerfile` has `api`, `worker`, and `migrate` targets. Production is
intended to run the API as a Cloud Run service and the worker as a Cloud Run
Worker Pool. Worker Pools have fixed/manual scaling rather than request-driven
autoscaling; deploy one worker instance initially and increase it deliberately.
Run the `migrate` target before deploying either runtime.
