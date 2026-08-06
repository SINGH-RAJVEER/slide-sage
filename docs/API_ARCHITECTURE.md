# Architecture

## Workspace

SlideSage consists of a Go API, a React web application, shared TypeScript
contracts, and shared UI components.

```text
apps/api   Go HTTP API, PostgreSQL repositories, Goose migrations, providers
apps/web   React application bundled and served by Bun
libs/types Shared API and presentation contracts
libs/ui    Shared React UI primitives and slide renderer
```

The Go API is the only application API. It owns authentication, sessions,
presentations, research, generation, billing, BYOK connections, rate limiting,
and PostgreSQL persistence.

## Runtime

The local stack is coordinated by devenv:

```text
PostgreSQL ready -> Goose migrations complete -> Go API ready -> Bun web ready
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
- `/billing`

The API uses `database/sql` with PostgreSQL and pgvector. Goose migrations live
in `apps/api/migrations` and are applied by `apps/api/scripts/migrate.sh`.

## Generation

Generation validates the request, resolves the server OpenRouter model or an
encrypted user provider connection, estimates and reserves points when needed,
and inserts a generating presentation before opening an SSE stream.

Provider output is normalized to bounded schema-v5 presentation documents before
slide events are emitted. The API rejects provider output that does not contain
substantive content. Successful generation settles the point reservation and
persists the final document transactionally. Provider, validation, cancellation,
and save failures mark the presentation failed and refund the active reservation.

Research preview uses Exa. Reviewed sources can be attached to generation and are
persisted with the presentation for attribution.

## Authentication

Authentication is implemented in `apps/api/internal/auth`. The API supports
email/password accounts, email verification OTPs, password reset OTPs, Google and
GitHub OAuth, signed HTTP-only session cookies, sign-out, and authenticated
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
