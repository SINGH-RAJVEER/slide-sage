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
| `POST` | `/api/research-presentation` | Research and summarize sources before generation |
| `POST` | `/api/iterate-presentation-stream` | Revise an existing deck over SSE |
| `GET` | `/api/presentations` | List the user's decks |
| `GET` | `/api/presentations/:id` | Get one owned deck |
| `DELETE` | `/api/presentations/:id` | Delete one owned deck and its associated memory |

Generation requires `topic` and `slide_count`; it accepts `detail_level`,
`tonality`, `research`, and an optional `research_payload`. Research options can
include `freshness`, `maxResults`, included or excluded domains, publication date
bounds, and `maxAgeHours`.

Iteration requires a presentation ID and feedback. Snake-case and camelCase ID
and slide-count fields are accepted for compatibility.

Generation and iteration return `402` before streaming when the account lacks
enough slide tokens. The response includes the remaining, required, and shortfall
amounts.

### Streaming

Streaming endpoints respond with server-sent events over a POST response. The
stream begins with `created` for new decks, forwards generation events such as
theme and slide updates, and ends with `saved`. The API sends SSE keepalive
comments while OpenRouter is silent. A `retry` event means the current partial
attempt must be discarded; its payload includes the next attempt, attempt limit,
delay, and reason. Only a validated `complete` event is persisted and charged.
Failures use an `error` event. Clients should parse the response stream rather
than use the browser `EventSource` API, which only supports GET.

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
