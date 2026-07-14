# API Reference

The local API origin is `http://localhost:8000`. JSON errors use:

```json
{ "error": { "message": "Description" } }
```

Authenticated requests use the Better Auth session cookie and must include
credentials from the browser.

## Health

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/` | No | Returns `{ status: "ok", timestamp }` |

## Authentication

Better Auth owns `/api/auth/*`, including email/password registration, email OTP,
password reset, session, sign-out, and OAuth callbacks. Project-specific wrappers
clear superseded OTP records and migrate legacy credential accounts during
sign-in. See [AUTH_API.md](AUTH_API.md).

## Profile

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| `GET` | `/api/profile` | None | Get the signed-in user's profile |
| `PUT` | `/api/profile` | `name`, `email`, `currentPassword`, `newPassword` | Update supplied profile fields |
| `POST` | `/api/profile/avatar` | `{ "imageUrl": "..." }` | Update the avatar URL |

All profile routes require authentication.

## Presentations

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/generate-presentation-stream` | Generate and persist a deck over SSE |
| `POST` | `/api/research-presentation` | Find sources before generation |
| `POST` | `/api/iterate-presentation-stream` | Revise an existing deck over SSE |
| `GET` | `/api/presentations` | List the user's decks |
| `GET` | `/api/presentations/:id` | Get one owned deck |
| `DELETE` | `/api/presentations/:id` | Delete one owned deck and its associated memory |

Generation requires `topic` and `slide_count`; it accepts `detail_level`,
`tonality`, `research`, and an optional `research_payload`. Research options can
include `freshness`, `maxResults`, included or excluded domains, publication date
bounds, and `maxAgeHours`. The research endpoint and payload contain source
records only. The web client presents those records in a compact source table
with a dedicated outbound link for each result. The research review fills the
available workspace and supports Enter as a shortcut to begin generation.

Iteration requires a presentation ID and feedback. Snake-case and camelCase ID
and slide-count fields are accepted for compatibility.

Generation and iteration return `402` before streaming when the account lacks
enough slide tokens. The response includes the remaining, required, and shortfall
amounts. Generation estimates add the input-token cost of the exact serialized
research context at one point per 1,000 AI tokens. The research endpoint returns
`estimated_tokens` when slide count and generation options are supplied, allowing
the review screen and final server-side charge to show the same estimate.

Presentation summaries include `status` (`ready` or `failed`) and
`has_research`. A failed generation remains in the presentation library with an
empty slide list and a `failure.retry` object in `slides_data`. That object stores
the original prompt, slide count, detail level, tonality, research setting, error
message, and any sources collected before the failure. Failed generations are
not charged. Clients fetch the full presentation on click, then open the saved
sources on `/generate/research` when they exist or prefill `/generate` when they
do not. The same retry action is available directly from `/presentation-error`,
so users do not need to return to the presentation library first.
Retry requests send the failed presentation ID as `retry_presentation_id`. The
API verifies that the row belongs to the current user and is still marked
`failed`, then updates that row through subsequent failures until a successful
generation replaces it. A retry therefore never adds another failed card.

### Streaming

Streaming endpoints respond with server-sent events over a POST response. The
stream begins with `created` for new decks, forwards generation events such as
theme and slide updates, and ends with `saved`. The API sends SSE keepalive
comments while OpenRouter is silent. A `retry` event means the current partial
attempt must be discarded; its payload includes the next attempt, attempt limit,
delay, and reason. Only a validated `complete` event is charged and stored as a
ready deck. Failures use an `error` event and persist retry metadata without
partial slides. Clients should parse the response stream rather than use the
browser `EventSource` API, which only supports GET.

When a generation response does not specify a theme, Slide Sage uses the
`corporate-blue` theme by default.

## Billing

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/billing/balance` | Yes | Return `slide_tokens` |
| `POST` | `/api/billing/checkout` | Yes | Create a Razorpay order |
| `POST` | `/api/billing/verify` | Yes | Verify payment and grant tokens idempotently |
| `POST` | `/api/billing/webhook` | Signature | Process `payment.captured` |

Checkout accepts `starter`, `pro`, `premium`, or `custom`. Custom quantities must
be between 10 and 1000.

## CORS

The API permits credentialed requests from `CORS_ORIGINS` or `CORS_ORIGIN`.
Local defaults are `http://localhost:5173` and `http://127.0.0.1:5173`.
