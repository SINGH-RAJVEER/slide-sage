# API Reference

The local API origin is `http://localhost:8000`. JSON errors use:

```json
{ "error": { "message": "Description" } }
```

Authenticated requests use the Better Auth session cookie and must include
credentials from the browser.

Rate-limited requests return `429`, include `Retry-After`, and use the
`RATE_LIMITED` error code. See [RATE_LIMITING.md](RATE_LIMITING.md).

## Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | Returns `{ status: "ok", timestamp }` |

## Authentication

The Go API exposes the Better Auth-compatible routes used by the web application,
including email/password registration, email OTP, password reset, session,
sign-out, social sign-in, and OAuth callbacks. It reads Better Auth scrypt hashes
and signed session cookies so existing accounts and sessions remain valid. See
[AUTH_API.md](AUTH_API.md).

## Profile

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| `GET` | `/api/profile` | None | Get the signed-in user's profile |
| `PUT` | `/api/profile` | `name`, `email`, `currentPassword`, `newPassword` | Update profile fields or perform a password-only Better Auth change |
| `POST` | `/api/profile/avatar` | `{ "imageUrl": "..." }` | Update the avatar URL |

All profile routes require authentication. Password changes require both the
current and new password, are delegated to Better Auth, and revoke other
sessions. They cannot be combined with name or email updates. Email changes
require current-password verification, normalize the new address, mark it
unverified, and invalidate old/new address OTPs. A user who has forgotten the
current password must complete the verified password-reset OTP flow first.

Avatar URLs must be valid HTTPS URLs no longer than 2,048 characters. URLs with
embedded credentials or control characters are rejected.

## Presentations

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/generate-presentation-stream` | Generate and persist a deck over SSE |
| `POST` | `/api/research-presentation` | Find sources before generation |
| `POST` | `/api/iterate-presentation-stream` | Revise an existing deck over SSE |
| `GET` | `/api/presentations` | List the user's decks |
| `GET` | `/api/presentations/:id` | Get one owned deck |
| `PATCH` | `/api/presentations/:id` | Apply persistent presentation mutations |
| `DELETE` | `/api/presentations/:id` | Delete one owned deck and its associated memory |

Generation requires `topic` and `slide_count`; the web client supports custom
slide counts from 1 through 40. Generation also accepts `detail_level`,
`tonality`, `theme`, `research`, and an optional `research_payload`. `theme`
accepts a built-in theme ID. Research options can include `freshness`,
`maxResults`, included or excluded domains, publication date bounds, and
`maxAgeHours`. The research endpoint and payload contain source records only. The
web client presents those records in a compact source table with a dedicated
outbound link for each result. The research review fills the available workspace
and supports Enter as a shortcut to begin generation.

Iteration requires a presentation ID and feedback. Snake-case and camelCase ID
and slide-count fields are accepted for compatibility.

Generation creates a `generating` presentation before contacting the provider.
Provider, content-validation, streaming, and final-save failures atomically mark
that record as `failed`, retain its prompt and generation settings, and refund
reserved points. Retrying reuses the failed presentation ID and moves the record
back to `generating`; malformed requests and other failures before reservation do
not create presentation records.

Provider output must use the schema-v5 content block contract with explicit
`text` fields for paragraphs, quotes, and callouts and `items` for bullets. The
API accepts narrow legacy aliases during normalization, but rejects generated
slides without substantive text instead of persisting synthetic placeholder
content as a successful presentation.

### Input Limits

Presentation routes read and measure the body before parsing JSON. Generation
bodies are limited to 256 KiB, research and iteration bodies to 32 KiB each, and
mutation bodies to 1 MiB. An oversized body returns `413`; malformed JSON,
non-object bodies, invalid types, and out-of-range values return `400`.

Topics and iteration feedback contain 1 through 400 trimmed characters. Slide
counts are integers from 1 through 40. Detail level is `brief`, `concise`,
`balanced`, `detailed`, or `comprehensive`; tonality is `casual`, `professional`,
`enthusiastic`, or `persuasive`. A direct-provider model identifier is limited
to 200 characters. Invalid or omitted theme values deliberately fall back to
`corporate-blue`.

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
limited to 64 characters, and optional `estimated_tokens` must be finite from 0
through 1,000,000. Server-generated and rendered presentation image URLs remain
HTTPS-only even though cited research links may use HTTP.

New generated presentation documents use bounded block schema version 5. The API
continues to load older documents, mapping `title`
to `cover`, `content` to `body`, `two-column` to `split`, and `image-right` to
`media-right`. Legacy `left` and `right` regions become semantic `primary`,
`secondary`, or `media` regions. Schema-v5 content layouts also include
`section`, `comparison`, `sidebar`, `media-left`, `quote`, `spotlight`, and
`canvas`.

Schema-v5 slides expose only bounded visual intent: tone, density, pattern, and
an optional HTTPS background image with alt text, a named focal point, and a
named overlay strength. Blocks similarly use allowlisted emphasis and treatment
values. Content slides may include an eyebrow and semantic region labels. No
arbitrary CSS, colors, coordinates, dimensions, or positioning values are part
of the composition contract.

Content slides support bounded, data-only semantic widgets for timelines, flows,
architecture diagrams, and comparisons. Widget nodes use allowlisted roles and
tones, edges can reference only nodes in the same widget, and direction is
horizontal or vertical. Generated widgets cannot carry code, HTML, raw SVG,
styles, class names, attributes, or URLs.
The Web renderer compiles widgets into deterministic full-width or column-width
SVG scenes and exports their nodes, text, and connectors as editable PowerPoint
objects. Unsupported widget data is shown explicitly rather than silently omitted.
The API normalizes older documents on read by assigning deterministic block IDs
and defaults for dimensions, composition fields, transitions, and effects.
`PATCH /api/presentations/:id` accepts a non-empty
`mutations` array containing at most 50 operations. Supported operations are
`update-presentation`, `update-slide`, `delete-slide`, and `reorder-slides`.
Slide IDs cannot be changed, reorder requests must contain every slide exactly
once, and the final slide cannot be deleted. All mutations in one request are
validated and applied to one document update.
Writes use the owned row's monotonic integer `revision` as a compare-and-swap
version. Every successful write increments it; a concurrent write returns `409`
instead of overwriting another editor mutation.

`GET /api/presentations` accepts integer `limit` and `offset` query parameters.
`limit` defaults to 20 and is bounded from 1 through 100; `offset` defaults to 0.
Its maximum is JavaScript's maximum safe integer. The response returns
`presentations`, `total`, `limit`, `offset`, and `has_more`.
`DELETE /api/presentations/:id` returns `204 No Content` with an empty body after
deleting the owned deck. Database foreign-key rules remove or detach its related
memory records as defined by each table.

Without a valid user provider connection, generation and iteration use the
configured SlideSage OpenRouter model. Before opening the stream, the API
atomically reserves the full quote; a new generation also creates its initial
presentation row in that transaction. Insufficient funds return `402` with the
remaining, required, and shortfall amounts.

Reservation leases expire after one hour. Later reservations lazily recover expired reservations for that
user; the ordinary billing balance endpoint is not a recovery trigger, and there
is no periodic recovery job.
Ordinary failures, cancellation, incomplete streams, and final revision
conflicts refund an active reservation. On success, one transaction marks the
operation settled, compare-and-swap updates the presentation, refunds the
difference between quote and measured charge, and records the resulting balance.
Each failure refund likewise uses one transaction to transition a still-reserved
operation and restore the full quote.
The measured charge is one point per 1,000 aggregate AI tokens and never exceeds
the quote.

Once a user connects a provider key, model generation is billed by that provider
and the presentation request reports zero SlideSage generation points. Generation
estimates include the research estimate supplied with reviewed sources, and
the research endpoint returns an `estimated_tokens` value when slide
count and options are supplied. The final `saved` event includes
`slide_tokens_charged` and `slide_tokens_remaining`.

Presentation summaries include `status` (`generating`, `ready`, or `failed`) and
`has_research`. A new placeholder remains `generating` until durable settlement;
stale generating placeholders are converted to recoverable failures. A failed
generation remains in the presentation library with an
empty slide list and a `failure.retry` object in `slides_data`. That object stores
the original prompt, slide count, detail level, tonality, theme, research setting,
error message, and any sources collected before the failure. Failed generations
refund their active reservation; if a process stops before refunding, one-hour
expiry recovery returns the quote during a later reservation or internal
point-accounting balance transaction. Clients fetch the full presentation on
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

Streaming endpoints respond with server-sent events over a POST response. The
stream begins with `created` for new decks, forwards generation events such as
`stage`, `outline`, theme, and slide updates, and ends with `saved`. Generation
stages are `researching`, `planning`, `drafting`, `designing`, and `finalizing`;
each stage includes a display message and bounded progress counts. The outline
contains the presentation title and one entry per generated slide. Generated
slides are normalized into safe schema-v5 content slides with allowlisted layouts,
blocks, themes, dimensions, and stable IDs before they are streamed or saved.
Clients treat slide events as index-based upserts. Iteration uses the current deck
as authoritative context and returns the same schema-v5 format. The
API sends SSE keepalive
comments while the selected provider is silent. A `complete` event contains the
normalized document after durable persistence and point settlement; `saved`
immediately follows as the durable success acknowledgement. Failures
use an `error` event and persist retry metadata without partial slides. Clients
must use `saved` as the durable success signal and should refetch after a
disconnect because the commit can succeed even if delivery of `saved` does not.
Clients should parse the
response stream rather than use the browser `EventSource` API, which only
supports GET. Web clients also treat non-JSON deployment and proxy error pages as
service failures rather than exposing a JSON parser exception.
Provider errors that happen before slide streaming, including account rate limits,
are preserved in the failed presentation so the retry screen can show an
actionable cause instead of a generic generation message.

The API validates the requested theme before generation. Invalid or omitted
values fall back to the `corporate-blue` theme. Layout and visual composition are
selected automatically from each slide's narrative role, visual intent, semantic
blocks, and available assets. Generated image placeholders contain descriptive
text but no URL; grounded image blocks require HTTPS URLs.

## Billing

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/billing/balance` | Yes | Return `slide_tokens` |
| `POST` | `/api/billing/checkout` | Yes | Create a Razorpay order |
| `POST` | `/api/billing/verify` | Yes | Verify a captured provider payment and grant points idempotently |
| `POST` | `/api/billing/webhook` | Signature | Process `payment.captured` |

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
Allowed request headers are `Content-Type` and `Authorization`.

## AI Provider Connections

Authenticated users with more than 50 points can manage encrypted BYOK
connections under `/api/ai`:

- `GET /api/ai/config`
- `POST /api/ai/connections`
- `PUT /api/ai/connections/:provider`
- `DELETE /api/ai/connections/:provider`
- `PUT /api/ai/selection`

Supported providers are `openai`, `google`, and `anthropic`. Generation requests
may include `ai: { provider, model }`; iteration resolves the user's current
selection server-side. Keys are never returned by these endpoints.
Successful connection deletion returns `204 No Content`.
