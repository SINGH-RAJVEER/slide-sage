# Durable Generation Worker

Presentation generation and iteration run as durable PostgreSQL-backed jobs. The
HTTP API accepts and accounts for work, River v0.43 schedules it, `cmd/worker`
executes it, and clients consume persisted server-sent events (SSE). Generation
does not depend on the lifetime of the request that submitted it.

## Components

| Component | Responsibility |
| --- | --- |
| `cmd/api` | Validate authenticated requests, reserve points, create application state, insert River jobs, and stream persisted events |
| River v0.43 | PostgreSQL-backed queue, retry scheduling, and worker coordination |
| `cmd/worker` | Fetch generation jobs, call the selected provider, normalize output, settle or refund points, persist the presentation, and append events |
| `generation_jobs` | User-visible job identity, payload, ownership, lifecycle, progress, cancellation, and error state |
| `generation_job_events` | Ordered, replayable SSE events for each application job |
| `cmd/migrate` | Apply embedded Goose application migrations followed by River migrations |

Migration `00015_add_generation_jobs.sql` creates `generation_jobs` and
`generation_job_events`. River maintains its own queue tables. The application
job ID is the public identifier; the River job ID is an internal scheduling
reference.

## Submission Transaction

`POST /generate-presentation-stream` and
`POST /iterate-presentation-stream` perform the durable handoff before opening
their event stream. In one PostgreSQL transaction, the API:

1. Locks and validates the idempotent point operation.
2. Reserves SlideSage points and records the ledger entry when the server model is used.
3. Creates the generating presentation placeholder for a new deck, or captures the expected revision for iteration or retry.
4. Creates the `generation_jobs` row and initial `generation_job_events` rows.
5. Calls River `InsertTx`, storing the River queue record in the same transaction.
6. Commits, then tails `generation_job_events` for the returned application job.

The transaction is all-or-nothing. A committed point reservation cannot exist
without its application job and River queue record, and an enqueue failure does
not leave a placeholder or reserved balance behind. Reusing an
`Idempotency-Key` with the same request attaches to the existing job event stream;
reusing it with different input returns `409`. Submission responses expose the
job and presentation IDs in `X-Generation-Job-ID` and `X-Presentation-ID`. If a
connection fails before those headers arrive, the client can recover the job via
`GET /generation-jobs/idempotency/{key}/job?kind=generation|iteration`.

The POST response remains an SSE response for compatibility, but provider work
is not performed by the API process. Closing that response only stops that
client's event tail. It does not cancel the job.

## Worker Lifecycle

The worker polls River's `generation` queue and processes application jobs with
these states:

| Status | Meaning |
| --- | --- |
| `queued` | Submission committed and is waiting for a worker |
| `running` | A worker has started an attempt |
| `retrying` | A temporary provider or network failure will be retried |
| `succeeded` | Presentation persistence and point settlement completed |
| `failed` | Processing reached a terminal error and the reservation was released |
| `cancelled` | A cancellation request was observed and finalized |

River permits up to three attempts for the generation job. Each attempt has a
seven-minute timeout for the sequential planning and drafting calls, whose HTTP
client timeout is three minutes per call. River rescues jobs left running for
eight minutes. On shutdown the worker marks itself unready, cancels maintenance,
and asks River to drain active jobs. River cancels remaining work after its
six-second soft-stop timeout so queue state can finalize within the Cloud Run
termination window. The worker retries
network errors, provider `429` responses, and provider `5xx` responses. Events
such as `created`, `theme`, `stage`, `retry`, `plan`, `outline`, `slide`, `complete`,
`saved`, and `error` are stored before the API delivers them. `saved` and `error`
are terminal stream events.

Cancellation is transactional. `POST /generation-jobs/{id}/cancel` locks the
application job, cancels its River job, releases the active reservation, records
the terminal event, and marks the application job cancelled in one transaction.
River also cancels the context of an in-flight provider request. The provider may
still finish work, but the locked terminal state prevents late success settlement.

## Job API

All job endpoints require the authenticated owner of the job.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/generation-jobs/{id}` | Return status, stage, progress, timestamps, presentation ID, kind, and any terminal error |
| `GET` | `/generation-jobs/idempotency/{key}/job?kind=...` | Recover a committed job after an ambiguous submission connection failure |
| `GET` | `/generation-jobs/{id}/events` | Stream persisted events and continue tailing until a terminal event |
| `POST` | `/generation-jobs/{id}/cancel` | Request cooperative cancellation of a queued, running, or retrying job |

Each SSE record has its `generation_job_events.id` as the SSE `id`. Resume after
a disconnect with either `Last-Event-ID: <id>` or `?after=<id>`. When both are
present, `Last-Event-ID` takes precedence. Only events with an ID greater than
the cursor are returned, so clients can replay missed events without restarting
generation.

The event endpoint can be consumed through `fetch` stream parsing. Browser
`EventSource` is not suitable when application authentication or custom resume
headers require request options unavailable to `EventSource`; the `after` query
parameter is available for clients that cannot set `Last-Event-ID`.

One API instance accepts at most 40 generation event streams and at most three
streams per user by default. Event rows are copied from PostgreSQL and the query
is closed before bytes are written to the client, so a slow client does not hold
a database connection. The API cancels active streams before graceful server
shutdown. Configure the limits with `GENERATION_STREAM_LIMIT` and
`GENERATION_STREAM_LIMIT_PER_USER`.

Cancellation returns `202` with `{"status":"cancellation_requested"}` when the
request is recorded. It returns `409` when the job is already terminal or is not
otherwise cancellable.

## Delivery and Accounting Guarantees

River provides durable queueing, but calls to OpenRouter or a BYOK provider are
outside the PostgreSQL transaction. External provider execution is at-least-once:
if a worker loses ownership or exits after sending a provider request but
before recording its result, a later attempt may call the provider again.
Providers can therefore observe duplicate execution even though SlideSage's
database state is idempotent.

Application accounting remains transactional:

- Submission reserves points, records the reservation ledger entry, creates application state, and inserts the River job atomically.
- Success settles the operation, saves the presentation with its expected revision, releases unused authorization, records terminal events, and completes the River job atomically.
- Failure or cancellation finalizes the operation, returns the active reservation with its ledger entry, records the terminal event, and finalizes the queue state atomically.
- The operation status prevents a reservation from being settled or refunded more than once.
- BYOK generation reserves zero SlideSage model points, while the durable job and event behavior remains the same.

These guarantees cover SlideSage balances and persisted state. They cannot make
an external provider request transactional or prevent a provider from billing a
duplicate attempt.

## Process Configuration

The worker reads the same `DATABASE_URL`, provider, and BYOK encryption settings
as the API, plus worker-specific controls:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WORKER_CONCURRENCY` | `2` | Maximum concurrent River jobs in one worker process |
| `WORKER_DATABASE_POOL_MAX` | `WORKER_CONCURRENCY + 3` | Maximum open and idle worker database connections |
| `WORKER_DRAIN_TIMEOUT` | `8` | Seconds allowed for graceful River shutdown after `SIGINT` or `SIGTERM`; kept below Cloud Run's termination window |
| `WORKER_HEALTH_PORT` | `8080` | Port for worker health probes |

`GET /live` returns `204` while the health server is running. `GET /ready`
returns `204` only while the worker accepts work and PostgreSQL responds to a
one-second ping. It returns `503` as soon as shutdown starts.

The worker runs generation recovery every minute. It processes at most 100
terminated jobs and 100 affected users per sweep, with at most two recovery
transactions running concurrently. Hourly maintenance deletes bounded batches
of expired rate-limit counters and unverified accounts. Maintenance stops before
River drains.

The API discovers model catalogs for independent BYOK connections concurrently,
with at most three catalog requests per configuration response and one active
catalog request per provider in each API process.

## Deployment

The intended production topology is a Cloud Run service for the API and a Cloud
Run Worker Pool for `cmd/worker`. The current service-based deployment must use
instance-based billing through `--no-cpu-throttling`; a minimum instance alone
does not allocate CPU between requests. API-to-worker coordination uses PostgreSQL
only; there is no HTTP or RPC call from the API to a worker instance. The worker
still makes its required outbound calls to PostgreSQL and the selected AI
provider.

Cloud Run Worker Pools use fixed/manual scaling rather than request-driven
autoscaling. Start with one worker instance, monitor queue latency, provider
limits, PostgreSQL connections, and job duration, then change the instance count
manually. Total potential job concurrency is the worker instance count multiplied
by `WORKER_CONCURRENCY`; size the database pool and provider limits accordingly.

`docker/Dockerfile` exposes three targets from the same source:

| Target | Entrypoint | Use |
| --- | --- | --- |
| `api` | `/app/api` | Cloud Run API service |
| `worker` | `/app/worker` | Cloud Run Worker Pool |
| `migrate` | `/app/migrate` | One-off migration job |

Run the `migrate` target successfully before starting or updating either runtime.
`cmd/migrate` applies embedded Goose migrations first and River migrations
second. It also recognizes the legacy Go API schema and baselines migrations
1-13 before applying migration 14. Migration 14 is an intentional pre-launch
accounting reset that removes existing user-owned data, so do not run it against
a database containing data that must be retained. The required deployment order
is therefore:

```text
PostgreSQL ready -> migrate succeeds -> API and worker start
```

Do not rely on API or worker startup to apply schema changes.

## Local Development

Devenv runs PostgreSQL, migrations, the API, the worker, and the web application.
The API and worker both wait for the migration task, and the web process waits for
both runtimes to become ready. The worker readiness probe uses
`http://localhost:8080/ready`.

See [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md) for commands and
[ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) for complete configuration.
