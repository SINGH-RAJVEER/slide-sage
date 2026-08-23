# API reference

The local API origin is `http://localhost:8000`. JSON errors use:

```json
{ "error": { "message": "Description" } }
```

Authenticated browser requests use the HTTP-only JWT cookie and must include
credentials. The API also accepts the same JWT in an `Authorization: Bearer`
header.

Rate-limited requests return `429`, include `Retry-After`, and use the
`RATE_LIMITED` error code. See [RATE_LIMITING.md](RATE_LIMITING.md).

## Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Returns `{ status: "ok", timestamp }` |

## Authentication

The Go API owns the auth routes used by the web application. They cover
email/password registration, email OTP, password reset, JWT tokens, sign-out,
social sign-in, and OAuth callbacks. The API can read older credential hash
formats used by existing accounts. See [AUTH_API.md](AUTH_API.md).

## Profile

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| `GET` | `/profile` | None | Get the signed-in user's profile |
| `PUT` | `/profile` | `name`, `email`, `currentPassword`, `newPassword` | Update profile fields or change the password |
| `POST` | `/profile/avatar` | `{ "imageUrl": "..." }` | Update the avatar URL |
| `POST` | `/profile/avatar/upload` | Multipart `file` field | Upload and use a local image |
| `GET` | `/profile/avatar/image/{id}` | None | Serve an uploaded avatar image |

Profile management routes require authentication. Uploaded avatar images are
public because browsers load their URLs without API credentials. Password
changes require both the current and new password. Existing JWTs remain valid
until they expire. The change cannot be combined with name or email updates. Email changes
require current-password verification, normalize the new address, mark it
unverified, and invalidate old/new address OTPs. A user who has forgotten the
current password must complete the verified password-reset OTP flow first.

Avatar URLs must be valid HTTPS URLs no longer than 2,048 characters. URLs with
embedded credentials or control characters are rejected. Local uploads accept
PNG, JPEG, WebP, and GIF files up to 800 KB. Uploads replace the previous stored
avatar and return the same profile-avatar response as URL updates.

## Presentations

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/presentation-jobs` | Submit generation, iteration, retry, or research preview as a durable job; returns job identity as JSON |
| `GET` | `/generation-jobs/{id}` | Get an owned durable generation job |
| `GET` | `/generation-jobs/{id}/events` | Stream persisted events for an owned generation job |
| `POST` | `/generation-jobs/{id}/cancel` | Request cancellation of an active generation job |
| `GET` | `/presentations` | List the user's decks |
| `GET` | `/presentations/:id` | Get one owned deck |
| `PATCH` | `/presentations/:id` | Apply persistent presentation mutations |
| `DELETE` | `/presentations/:id` | Delete one owned deck and its associated memory |

Generation requires `topic` and `slide_count`; the web client supports custom
slide counts from 1 through 40. Generation also accepts `detail_level`,
`tonality`, `research`, and an optional `research_payload`. New presentations
start with `corporate-blue`; users can change the saved theme in the viewer.
Research options can include `freshness`,
`maxResults`, included or excluded domains, publication date bounds, and
`maxAgeHours`. The research endpoint and payload contain source records only. The
web client presents those records in a compact source table with a dedicated
outbound link for each result. The research review fills the available workspace
and supports Enter as a shortcut to begin generation.

Iteration uses `parent_presentation_id` and `topic`. Retry uses
`retry_presentation_id`. Request fields use snake case only.

Generation creates a `generating` presentation placeholder before work is
available to the worker. Point reservation, placeholder creation, application job
creation, initial event persistence, and River insertion commit in one database
transaction. Iteration records the existing presentation revision in the same
durable handoff. Provider, content-validation, cancellation, and final-save
failures mark the job terminal and release the active reservation. Retrying reuses
the failed presentation ID and moves the record back to `generating`; malformed
requests and failures before the submission transaction do not create a job or
presentation record.

Provider output must use the current content block contract with explicit
`text` fields for paragraphs, quotes, and callouts and `items` for bullets. The
API does not translate older document shapes or block aliases. It rejects
generated slides without substantive text instead of persisting synthetic
placeholder content as a successful presentation.

### Input limits

Presentation routes read and measure the body before parsing JSON. Generation
bodies are limited to 256 KiB, research and iteration bodies to 32 KiB each, and
mutation bodies to 1 MiB. An oversized body returns `413`; malformed JSON,
non-object bodies, invalid types, and out-of-range values return `400`.

Topics and iteration feedback contain 1 through 400 trimmed characters. Slide
counts are integers from 1 through 40. Detail level is `brief`, `concise`,
`balanced`, `detailed`, or `comprehensive`; tonality is `casual`, `professional`,
`enthusiastic`, or `persuasive`. A direct-provider model identifier is limited
to 200 characters.

When supplied, `research` must be an object with a boolean `enabled` field.
`maxResults` is 1 through 8, each domain list contains at most 10 non-empty
entries of at most 253 characters, dates are real `YYYY-MM-DD` values with the
start no later than the end, and `maxAgeHours` is an integer from 0 through
8,760. The standalone research endpoint requires `research.enabled=true`.

A generation `research_payload` is limited to 128 KiB after serialization and
at most eight source objects. Source URLs must be HTTP or HTTPS and no longer
than 2,048 characters. Titles are limited to 500 characters, snippets to 2,000,
authors to 200, summaries to 4,000, and each source may have at most eight
highlights of 1,200 characters each. Retrieval and publication date strings are
limited to 64 characters. Legacy `estimated_tokens` metadata is accepted for
retry compatibility but ignored for billing; point charges are server-owned.
Server-generated and rendered presentation image URLs remain
HTTPS-only even though cited research links may use HTTP.

Generated presentation documents do not carry a schema-version field. New deck
generation first creates and validates a persisted `deckPlan`, then drafts the
deck against it. The stream emits a `plan` event before slide events. See
[DECK_PLANNING.md](DECK_PLANNING.md). The API
does not load or translate earlier stored document shapes. Content layouts include
`section`, `comparison`, `sidebar`, `media-left`, `quote`, `spotlight`, and
`canvas`.

Content slides expose only bounded visual intent: tone, density, pattern, and
an optional HTTPS background image with alt text, a named focal point, and a
named overlay strength. Blocks similarly use allowlisted emphasis and treatment
values. Content slides may include an eyebrow and semantic region labels.
Optional title, subtitle, and block bounds use the canonical 1280 by 720 slide
space, are snapped to an 8 pixel grid, and are clamped to slide boundaries. No
arbitrary CSS, colors, or unbounded positioning values are part of the
composition contract.

Content slides support bounded, data-only semantic widgets for timelines, flows,
architecture diagrams, and comparisons. Widget nodes use allowlisted roles and
tones, edges can reference only nodes in the same widget, and direction is
horizontal or vertical. Generated widgets cannot carry code, HTML, raw SVG,
styles, class names, attributes, or URLs.
The Web renderer compiles widgets into deterministic full-width or column-width
SVG scenes and exports their nodes, text, and connectors as editable PowerPoint
objects. Unsupported widget data is shown explicitly rather than silently omitted.
The API returns stored documents without translating older slide formats.
Presentation writes validate and normalize the current document contract.
`PATCH /presentations/:id` accepts a non-empty
`mutations` array containing at most 50 operations. Supported operations are
`update-presentation`, `update-slide`, `delete-slide`, and `reorder-slides`.
Slide IDs cannot be changed, reorder requests must contain every slide exactly
once, and the final slide cannot be deleted. All mutations in one request are
validated and applied to one document update.
Writes use the owned row's monotonic integer `revision` as a compare-and-swap
version. Every successful write increments it; a concurrent write returns `409`
instead of overwriting another editor mutation.

`GET /presentations` accepts integer `limit` and `offset` query parameters.
`limit` defaults to 20 and is bounded from 1 through 100; `offset` defaults to 0.
Its maximum is JavaScript's maximum safe integer. The response returns
`presentations`, `total`, `limit`, `offset`, and `has_more`.
`DELETE /presentations/:id` returns `204 No Content` with an empty body after
deleting the owned deck. Database foreign-key rules remove or detach its related
memory records as defined by each table.

Without a valid user provider connection, generation and iteration use the
configured SlideSage OpenRouter model. Point balances use integer milli-points:
one point is 1,000 milli-points and one provider token is one milli-point. Before
the job is enqueued, the API reserves a bounded authorization covering the
serialized prompt plus the explicit output-token ceiling. The reservation,
ledger entry, placeholder when applicable, application job, initial events, and
River `InsertTx` are one transaction. The client supplies the job ID in the
`job_id` field; it doubles as the idempotency key and must contain 16-128
URL-safe characters when provided (the server generates one otherwise).
Resubmitting the same job ID with the same request attaches to the existing job
and prevents another reservation; reusing it with a different request returns
`409`.

Successful generation settles against the provider's authoritative aggregate token
usage and releases the unused authorization. Missing provider usage is a failure:
the presentation is not marked ready and its reservation is released. A client
or API stream disconnect does not cancel the River job. The worker continues and
persists events for later replay. Failures, revision conflicts, cancellation, and
failed persistence finalize and release the active authorization even if the
presentation was changed or deleted.

External provider execution is at-least-once. A worker interruption after sending
a provider request but before recording its result can cause a later River attempt
to call the provider again. The provider may therefore observe or bill duplicate
execution. SlideSage accounting remains idempotent: operation status, balance
updates, ledger entries, final presentation persistence, settlement, and refunds
use transactions so an authorization is settled or refunded only once.

Every balance change is recorded in the immutable `point_ledger`, including signup
credits, payment credits, reservations, and releases. Balances are never allowed to
be negative. The final `saved` event includes `slide_tokens_charged` and
`slide_tokens_remaining` as point values for browser display.

Once a user connects a provider key, model generation is billed by that provider
and reserves zero SlideSage model points. SlideSage web research is separate from
model billing: each successful Exa search costs one point, including for BYOK users.
Research has its own idempotent point operation; provider and parsing failures refund
the fee. The research response includes `slide_tokens_remaining` and the final
generation event includes the model charge and remaining balance.

Presentation summaries include `status` (`generating`, `ready`, or `failed`) and
`has_research`. A new placeholder remains `generating` while its durable job is
queued, running, or retrying. A terminally failed generation remains in the
presentation library with an
empty slide list and a `failure.retry` object in `slides_data`. That object stores
the original prompt, slide count, detail level, tonality, research setting,
error message, and any sources collected before the failure. Failed and cancelled
jobs release their active authorization. Clients fetch the full presentation on
click, then open the saved
sources on `/generate/research` when they exist or prefill `/generate` when they
do not. The same retry action is available directly from `/presentation-error`,
so users do not need to return to the presentation library first. That error
page keeps recovery focused on retrying or deleting the unfinished presentation
and does not show a separate presentations-list action.
Retry requests send the failed presentation ID as `retry_presentation_id`. The
API verifies that the row belongs to the current user and is still marked
`failed`, then updates that row through subsequent failures until a successful
generation replaces it. A retry therefore never adds another failed card.

### Streaming

Streaming submission endpoints respond with server-sent events over a POST
response. Before streaming, the API transactionally creates the application job,
persists its initial events, and inserts the River job. It then tails persisted
`generation_job_events`; provider execution occurs in `cmd/worker`, not in the
request handler.

The stream begins with `created`, forwards generation events such as `theme`,
`stage`, `retry`, `plan`, and slide updates, and ends with `saved`. The theme
event reports the assigned default for generation or the saved theme for iteration.
Worker stages
are `planning`, `drafting`, `designing`, and `finalizing`; each stage includes a display
message and bounded progress counts. Generated slides are normalized into safe
content slides with allowlisted layouts,
blocks, themes, dimensions, and stable IDs before they are streamed or saved.
Clients treat slide events as index-based upserts. Iteration uses the current deck
as authoritative context and returns the same current format. The API sends SSE
keepalive comments while no new persisted event is available. A `complete` event
contains the normalized document after durable persistence and point settlement; `saved`
immediately follows as the durable success acknowledgement. Failures
use an `error` event and persist retry metadata without partial slides. Clients
must use `saved` as the durable success signal. Closing the POST response does not
cancel generation; clients can inspect and resume the same job after a disconnect.
Clients should parse the
response stream rather than use the browser `EventSource` API, which only
supports GET. Web clients also treat non-JSON deployment and proxy error pages as
service failures rather than exposing a JSON parser exception.
Provider errors that happen before slide streaming, including account rate limits,
are preserved in the failed presentation so the retry screen can show an
actionable cause instead of a generic generation message.

### Durable job status and replay

`GET /generation-jobs/{id}` returns the authenticated owner's durable job state.
The response includes `id`, `presentation_id`, `kind`, `status`, `progress`,
`created_at`, and `updated_at`, with `stage` and `error` when available. Status is
`queued`, `running`, `retrying`, `succeeded`, `failed`, or `cancelled`.

`GET /generation-jobs/{id}/events` replays ordered persisted SSE events and then
tails new events until `saved` or `error`. Every event has a numeric SSE `id`
from `generation_job_events`. Send the last received ID in `Last-Event-ID` or as
`?after=<id>`; the header takes precedence when both are present. The API returns
only events after that cursor. Browser clients that cannot set the resume header
can use the query parameter.

`POST /presentation-jobs` returns `202 Accepted` with
`{"job_id","presentation_id","status":"queued"}` as JSON; resubmitting an
already-committed job ID returns `200` with `"status":"existing"`. The client
chooses the job ID before sending, so if the connection fails before the
response arrives it can poll `GET /generation-jobs/{id}` to learn whether the
submission committed, then open `/generation-jobs/{id}/events`. A `preview:
true` body runs research only and responds synchronously with `sources`,
`estimated_tokens`, and `slide_tokens_remaining` instead of creating a job.

`POST /generation-jobs/{id}/cancel` transactionally finalizes cancellation for a
`queued`, `running`, or `retrying` job and returns `202` with
`{"status":"cancellation_requested"}`. It returns `409` when no active owned job
can be updated. River cooperatively cancels an in-flight job context. The provider
may still finish its external work, but the locked terminal application state
prevents a late success from settling after cancellation.

See [GENERATION_WORKER.md](GENERATION_WORKER.md) for queue, delivery, accounting,
worker operation, and deployment details.

Generation assigns `corporate-blue` without accepting a theme request field.
Iteration preserves the saved presentation theme. Layout and visual composition are
selected automatically from each slide's narrative role, visual intent, semantic
blocks, and available assets. Generated image placeholders contain descriptive
text but no URL; grounded image blocks require HTTPS URLs.

## Billing

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/billing/balance` | Yes | Return `slide_tokens` |
| `POST` | `/billing/checkout` | Yes | Create a Razorpay order |
| `POST` | `/billing/verify` | Yes | Verify a captured provider payment and grant points idempotently |
| `POST` | `/billing/webhook` | Signature | Process `payment.captured` |

Checkout accepts `starter`, `pro`, `premium`, or `custom`. Starter grants 25
points for ₹50, Pro grants 250 points for ₹450, and Premium grants 625 points for
₹1000. Custom quantities must be between 25 and 2500 points and use the same
₹2-per-point base rate with 10% and 20% volume discounts at 250 and 625 points.

Checkout rejects Razorpay orders whose entity, amount, amount due, amount paid,
currency, receipt, status, or partial-payment flag differs from the request.
Browser verification first checks the strict hexadecimal HMAC signature, then
fetches the payment from Razorpay and requires a captured INR payment whose
payment ID, order ID, and amount match the local order. Webhooks verify the HMAC
against the exact raw request body and accept only complete `payment.captured`
entities.

Claiming a created payment and adding its points happen in one database
transaction. Repeating the same payment is idempotent and returns the current
balance; attempts to link an order to different payment details return `409`.
An authenticated verification for another user's order returns `403`. A webhook
for an order not yet visible locally returns `503` so Razorpay can retry.

## CORS

The API permits credentialed requests from `CORS_ORIGINS` or `CORS_ORIGIN`.
Local defaults are `http://localhost:5173` and `http://127.0.0.1:5173`.
Allowed methods are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS`, so
browser presentation mutations can complete a credentialed `PATCH` preflight.
Allowed request headers are `Content-Type`, `Authorization`,
and `Last-Event-ID`. Browser event replay can also use `?after=` without adding a
custom header.

## AI provider connections

Authenticated users with more than 50 points can manage encrypted BYOK
connections under `/ai`:

- `GET /ai/config`
- `POST /ai/connections`
- `PUT /ai/connections/:provider`
- `PUT /ai/connections/:provider/enabled`
- `DELETE /ai/connections/:provider`
- `PUT /ai/selection`

Supported providers are `openai`, `google`, and `anthropic`. Generation requests
may include `ai: { provider, model }`; iteration resolves the user's current
selection server-side. The enabled endpoint accepts `{ "enabled": boolean }`
and pauses that provider without deleting its saved key. Keys are never returned by these endpoints.
Successful connection deletion returns `204 No Content`.
