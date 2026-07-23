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
| `PATCH` | `/api/presentations/:id` | Apply persistent presentation mutations |
| `DELETE` | `/api/presentations/:id` | Delete one owned deck and its associated memory |

Generation requires `topic` and `slide_count`; the web client supports custom
slide counts from 1 through 40. Generation also accepts `detail_level`,
`tonality`, `theme`, `layout_preference`, `research`, and an optional
`research_payload`. `theme` accepts a built-in theme ID. `layout_preference`
accepts `auto`, `content`, `two-column`, `image-led`, or `data-led`. Research options can
include `freshness`, `maxResults`, included or excluded domains, publication date
bounds, and `maxAgeHours`. The research endpoint and payload contain source
records only. The web client presents those records in a compact source table
with a dedicated outbound link for each result. The research review fills the
available workspace and supports Enter as a shortcut to begin generation.

Iteration requires a presentation ID and feedback. Snake-case and camelCase ID
and slide-count fields are accepted for compatibility.

Presentation documents use schema version 5. The API continues to load older
documents and maps `title` to `cover`, `content` to `body`, `two-column` to
`split`, and `image-right` to `media-right`. Legacy `left` and `right` regions
become semantic `primary`, `secondary`, or `media` regions. New content layouts
also include `section`, `comparison`, `sidebar`, `media-left`, `quote`,
`spotlight`, and `canvas`.

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
`mutations` array. Supported operations are `update-presentation`, `update-slide`,
`delete-slide`, and `reorder-slides`. Slide IDs cannot be changed, reorder requests
must contain every slide exactly once, and the final slide cannot be deleted. All
mutations in one request are validated and applied to one document update.
Writes use the owned row's `updated_at` value as a compare-and-swap revision. A
concurrent write returns `409` instead of overwriting another editor mutation.

Generation and iteration return `402` before streaming when the account lacks
enough slide tokens. The response includes the remaining, required, and shortfall
amounts. Generation estimates add the input-token cost of the exact serialized
research context at one point per 1,000 AI tokens. The research endpoint returns
`estimated_tokens` when slide count and generation options are supplied, allowing
the review screen and final server-side charge to show the same estimate.

Presentation summaries include `status` (`ready` or `failed`) and
`has_research`. A failed generation remains in the presentation library with an
empty slide list and a `failure.retry` object in `slides_data`. That object stores
the original prompt, slide count, detail level, tonality, theme, layout
preference, research setting, error message, and any sources collected before
the failure. Failed generations are
not charged. Clients fetch the full presentation on click, then open the saved
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
theme and slide updates, and ends with `saved`. The API sends SSE keepalive
comments while OpenRouter is silent. A `retry` event means the current partial
attempt must be discarded; its payload includes the next attempt, attempt limit,
delay, and reason. If every requested slide was parsed before the provider stream
failed or returned a malformed trailing envelope, the API preserves those slides
and completes the deck instead of emitting a destructive retry. Only a
`complete` event is charged and stored as a ready deck. Failures use an `error`
event and persist retry metadata without partial slides. Clients should parse the
response stream rather than use the browser `EventSource` API, which only
supports GET. Web clients also treat non-JSON deployment and proxy error pages as
service failures rather than exposing a JSON parser exception.

The API validates the requested theme and layout preference before generation.
Invalid or omitted values fall back to the `corporate-blue` theme and `auto`
layout preference. Generated image placeholders contain descriptive text but no
URL; grounded image blocks require HTTPS URLs.

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
