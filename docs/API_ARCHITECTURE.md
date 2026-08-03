# Architecture

## Workspace

SlideSage combines a Go API module with a Bun workspace for the web app, shared libraries, and retained legacy API.

```text
apps/api          Go HTTP API, Goose migrations, PostgreSQL repositories, and providers
apps/api-legacy   Legacy Hono Worker, Better Auth, Drizzle schema, and services
apps/web          React 19 application built by Vite
libs/types        Shared API, presentation, research, profile, and billing contracts
libs/ui           Shared React UI primitives
```

Go tooling formats, vets, and tests the primary API. Biome and Bun handle the TypeScript workspaces; legacy API tests use isolation because modules hold database and auth state.

`apps/api` is the primary direct Go API service using the existing PostgreSQL schema.
It exposes the health, credential/session, profile, presentation, research,
generation SSE, billing, and BYOK connection route families under `/api`.
Configure `DATABASE_URL` and the provider credentials described in
`ENVIRONMENT_VARIABLES.md`; it does not depend on a TypeScript API upstream.

## Runtime

The local stack is defined and coordinated by devenv's native service, task, and process management:

```text
PostgreSQL ready -> Goose migrations complete -> API starts -> Vite web starts
```

PostgreSQL 18 includes pgvector. Local dev state is stored in `.devenv/state/postgres/`.

The primary API entry point is `apps/api/cmd/api/main.go`. Authentication, signed session cookies, OAuth, OTP flows, rate limiting, and route handlers run in the same Go process. The API mounts:

- Public health status at `/api/health`
- Better Auth-compatible browser routes at `/api/auth`
- Encrypted provider connection routes at `/api/ai`
- Profile routes at `/api/profile`
- Presentation and research routes at `/api`
- Billing routes at `/api/billing`

Authenticated routes validate the Better Auth session cookie. OpenRouter-backed
presentation generation and revision atomically reserve the full point quote
before opening an SSE stream. BYOK generation is billed by the provider and uses
a zero-point operation so lifecycle and presentation writes follow the same
transactional path without deducting SlideSage points.

Transport contracts shared by the API and web app belong in `libs/types` and use the `@slidesage/types` alias. This includes presentation list/detail responses, profile requests and responses, billing checkout and verification payloads, common API errors, and streaming events. Go service types remain in `apps/api`, reusable UI primitives belong in `libs/ui`, and legacy database schema types remain in `apps/api-legacy`.

## Primary Go Flow

The Go service validates generation requests, resolves the selected encrypted BYOK credential or the server OpenRouter model, reserves the point quote only for OpenRouter, and creates the placeholder deck atomically. Provider output is normalized into bounded schema-v5 content slides before any slide event is emitted. Durable compare-and-swap persistence and point settlement complete before `complete` and `saved`; failures retain retry metadata and refund active reservations. Silent providers receive SSE keepalive comments.

Research preview uses Exa and reviewed `research_payload` sources are added to the generation prompt and persisted document. Presentation reads and mutations normalize documents to schema 5, stable slide/block IDs, built-in themes, bounded dimensions, and data-only content blocks.

## Legacy TypeScript Design

The remaining architecture sections describe the richer semantic cache, RAG, scene-v6 compiler, and Worker deployment retained in `apps/api-legacy`. They are useful migration references but are not executed by the primary Go process.

## Presentation Flow

1. The web app submits generation settings, a built-in theme, and optional
   research filters. Layout and composition are selected automatically from each
   slide's content and narrative purpose.
2. When research is enabled, the app-level streaming provider waits on a
   dedicated preview state while Exa sources load. The source preview remains
   visible for review, the request continues if the user leaves the research
   page, completed sources are reused when they return, and generation stays
   disabled until that request finishes. Exa receives the caller's abort signal
   and a bounded request timeout, so client cancellation stops the provider
   request rather than leaving detached work.
3. RAG retrieves relevant deck, slide, style, feedback, template, and source
   context from PostgreSQL.
4. The API checks the shared pgvector outline cache using the topic and exact
   generation constraints. On a miss, the active OpenRouter or BYOK model produces a semantic outline with
   one objective, narrative role, visual intent, and source references per card.
   A second constrained call always drafts one slide per outline card. Shared
   outline planning excludes user-scoped generation memory; live drafting keeps
   that personalized context. The outline is persisted with the deck so later
   tools can understand the intended story instead of reconstructing it from
   rendered content.
5. A deterministic design pass maps narrative and visual intent to the bounded
   layout system, normalizes block regions, and reserves image placeholders when
   an image-led card has no grounded asset. The model does not return HTML, CSS,
   component code, or arbitrary styling.
6. The API streams `created`, `stage`, `outline`, slide progress, `complete`,
   `saved`, or `error` events. `complete` is provider completion only; `saved` is
   emitted after durable persistence and point settlement.
7. One transaction settles the point operation, compare-and-swap writes the
   completed deck, refunds quote minus measured usage, and records the resulting
   balance. Semantic-memory writes follow as non-critical work. A failed
   generation keeps the initial row and replaces its placeholder data with a
   failed-state payload containing the prompt, options, error, and any research
   sources collected before failure. A separate refund transaction atomically
   transitions the active reservation and restores the quote. If the process
   stops first, reservations expire after one hour and are recovered lazily by a
   later point-accounting transaction.
8. The app-level streaming provider keeps consuming the response when the user
   navigates to another route. A persistent top-right status control reports
   generated-slide progress on every route except login, including the Generate
   page after a user starts generation from Research Insights, and returns to the
   live viewer when activated. The main generation form does not render streaming
   failures inline; it writes them to the browser console and stops its loading
   state.
   End-user generation failures use the same top-right position in an assertive
   pop-in below the header and dismiss automatically after an eight-second
   cooldown.
   Starting generation navigates to the viewer in the same interaction, before
   the stream response or first slide arrives. The viewer keeps its full control
   surface visible and displays a blank 16:9 slide with a centered loader until
   streamed content is available. Content-dependent controls remain disabled,
   and startup failures route to the presentation error screen.
   The global active-generation indicator is suppressed on that generation's own
   viewer route because progress is already represented inside the viewer; it
   remains available when the user navigates elsewhere.
9. The web app treats `saved`, rather than `complete`, as the persistence signal.
   It refreshes an open Presentations page after that event and links the completed
   status to the stored deck.
10. Failed items are marked as ready to retry in Presentations. Clicking one loads
   its detail and routes to the saved sources review when research is available,
   or to the main generation form with its prompt and options preselected.
11. The web viewer renders the deck and can export an editable PowerPoint file in
   the browser.

### Presentation Document

Schema-version-5 presentations remain supported as persisted compatibility
documents. A v5 content slide chooses a semantic layout from `cover`, `section`,
`body`, `split`, `comparison`, `sidebar`,
`media-left`, `media-right`, `quote`, `spotlight`, or `canvas`. Blocks occupy
`main`, `primary`, `secondary`, or `media` regions and contain bounded paragraph,
bullet, table, image, image-placeholder, quote, callout, statistic, or widget
data. The schema adds semantic slide tone, density, and pattern plus bounded block
emphasis and treatment. Optional background images require HTTPS and use named
focal-point and overlay values rather than coordinates or arbitrary styling.
Eyebrows and region labels provide optional narrative context. Documents older
than v5 continue through the legacy normalization path.

Stored older layouts normalize to their v5 equivalents: `title` becomes `cover`,
`content` becomes `body`, `two-column` becomes `split`, and `image-right` becomes
`media-right`. Old `left` and `right` regions become the appropriate semantic
regions. Image placeholders reserve a stable visual area and describe the
intended asset without inventing or fetching an ungrounded image URL.
Chart slides retain their structured chart configuration. The API normalizes
model output at the stream boundary, drops unknown fields and unsupported blocks,
restricts image URLs to HTTPS, and stores only the normalized document.

The React viewer maps this content into predefined layout components and applies
the selected built-in theme declaratively. Model strings remain React text nodes;
the current generation path does not use `dangerouslySetInnerHTML`. Older saved
HTML decks are parsed as inert documents by a compatibility adapter that extracts
only text, known semantic elements, and HTTPS images before passing the result to
the same component renderer. New decks never enter this legacy path.

Generation exposes a theme dropdown while the scene pipeline chooses composition
automatically. The viewer retains its current-slide layout dropdown for compatible
schema-v5 content slides; changing to the image-right layout creates a structured
image placeholder when the slide has no visual block. That layout-owned
placeholder is removed when the slide returns to a single-column layout, while
authored placeholders and real images remain. Viewer changes update the active
deck model immediately and are included in the current PowerPoint export.

The presentation viewer and marketplace theme preview support Arrow Left/Right
and J/L for previous/next navigation, with Arrow Up/Down jumping to the
first/last slide. Holding a previous/next key follows a viewer-controlled
cadence: the first repeat occurs after 250 milliseconds, then navigation
advances every 120 milliseconds until key release or focus loss. Keyboard
navigation remains disabled while typing in editable controls.

### Presentation Downloads

The viewer exposes a Download menu with PowerPoint and PDF options. For PPTX, it
passes the complete presentation model to the browser-side builder. PowerPoint
export does not depend on mounted carousel slides and does not capture slide
screenshots. The same structured layouts and blocks used by React map to native
PowerPoint text boxes, lists, tables, shapes, and images. Chart slides become
native PowerPoint charts with their category and series data retained for
editing. Legacy decks first pass through the same compatibility adapter used by
the web renderer, so web and PowerPoint no longer interpret legacy HTML through
separate code paths.

The export uses a widescreen 16:9 layout and maps each Slide Sage theme to a
PowerPoint-safe color and font palette. Images are embedded when the browser can
fetch them; a failed or cross-origin image becomes an editable labeled
placeholder so it does not abort the deck. PowerPoint has no polar-area chart
type, so those charts are exported as editable radar charts. The downloaded file
uses the presentation title and the `.pptx` extension. The download control is
disabled for empty decks, prevents overlapping exports, and reports write
failures without discarding the presentation currently shown in the viewer.

PDF export captures each mounted React slide after fonts and theme styles are
applied, then writes the captures in presentation order to 16:9 PDF pages. This
keeps the PDF visually aligned with the current viewer, including charts, theme
changes, and per-slide layout edits. PDF output uses the presentation title and
the `.pdf` extension.

Database lifetime differs by runtime. Bun reuses a process-wide Postgres.js pool
per connection string and puts the selected Drizzle instance in
`AsyncLocalStorage` for each request. Defaults are 10 seconds to connect, 20
seconds idle, and five pooled connections.

The Cloudflare Worker prefers `HYPERDRIVE.connectionString`, then falls back to
`DATABASE_URL`. It creates one Postgres.js client with `max: 1` for each request,
keeps Drizzle access scoped to that invocation, and closes the client only after
the response body is consumed or cancelled. Delayed closure is required for SSE
because stream work continues after the response object is created. Worker
clients must not be cached across requests because Cloudflare isolates request
I/O contexts; Hyperdrive should be used to absorb connection churn when the
deployment provides that binding.

Iteration follows the same path but uses an existing presentation and user
feedback as context.

## Data

The PostgreSQL schema includes Better Auth tables, presentations, payments,
operational ledgers, and semantic-memory tables:

- `generation_point_operations`
- `api_rate_limits`
- `rag_context`
- `slide_embeddings`
- `deck_memories`
- `source_chunks`
- `prompt_events`
- `slide_templates`
- `example_generations`
- `style_memories`
- `feedback_memories`
- `semantic_commands`
- `semantic_cache_entries`

Canonical migrations live in `apps/api/migrations` and are applied by Goose. The
Drizzle schema entry point retained for Worker types and Drizzle Studio is
`apps/api-legacy/src/db/schema.ts`. It
re-exports domain modules from `apps/api-legacy/src/db/schema/`: authentication,
presentations, billing, RAG context, slide memory, source memory, generation
memory, style memory, and cross-domain relations. Add tables and inferred types
to the matching domain module, and define relationships that cross modules in
`relations.ts`; keep those definitions synchronized with each Goose migration.

Repository classes own persistence. Route handlers should validate HTTP input and
translate service results, while AI, research, RAG, profile, and billing logic
remain in services.

`generation_point_operations` is the reservation ledger for generation and
iteration. New-presentation reservation includes creation of the placeholder row
in one transaction. Settlement includes the final owned-revision write and
partial quote refund in one transaction; failure refunds atomically transition a
still-reserved operation and restore its full quote. One-hour expiry protects
against points remaining reserved after a process or stream disappears, while an
active stream renews its lease every five minutes. BYOK requests use zero-point
operations for the same lifecycle guarantees.

`api_rate_limits` contains hashed fixed-window identities and counters shared by
all instances. Counter writes are atomic PostgreSQL upserts. The middleware
returns `429` and `Retry-After` when a policy is exceeded, but deliberately fails
closed with `503` on database or secret errors. See
[RATE_LIMITING.md](RATE_LIMITING.md) before deploying because a missing migration
or unavailable database blocks protected requests.

## Request Safety

Presentation routes enforce byte limits before JSON parsing and then validate
types, lengths, enumerations, dates, domains, source counts, URLs, and pagination
ranges. Oversized bodies return `413`; other invalid input returns `400`.
Generated model output is constrained with strict JSON Schema and normalized
again before streaming or persistence.

Custom `POST`, `PUT`, `PATCH`, and `DELETE` routes reject browser requests whose
`Origin` is neither the API origin nor a configured CORS origin. Requests without
an `Origin` are also rejected when Fetch Metadata marks them as cross-site. Better
Auth retains its own trusted-origin validation, and direct signed webhooks remain
compatible because non-browser requests do not send cross-site browser metadata.

The request logger records only event name, method, URL path without query
parameters, response status, and duration. Safe error logs retain an allowlisted
error class name but omit messages, stack traces, request bodies, headers,
provider payloads, OTPs, API keys, and database details. Routes return generic
errors where an upstream or internal message could disclose credentials or
provider data.

`apps/api-legacy/src/services/ai.service.ts` is the legacy presentation-AI facade. Its
supporting `services/ai/` modules separately own message construction, research
source resolution, presentation-content normalization, and resilient OpenRouter
stream orchestration. Keep provider transport and retry behavior out of the
facade so generation and iteration share one streaming implementation.

The staged generation modules also separate outline generation from deterministic
design. `presentation-outline.ts` owns the planning schema and normalization;
`presentation-design.ts` owns content-aware layout selection without another
model call. This is intentionally a hybrid pipeline: AI controls meaning and
narrative while application code controls renderable composition.

The route persists the canonical completed generation document rather than
reconstructing a fixed subset of its fields. This preserves the outline,
dimensions, and future composition metadata. Incremental slide events are
upserted by index in both the API and web client so a later compiled revision can
replace an earlier draft without duplicating the slide.

New generation compiles semantic model output into schema-version-6 scene slides.
The scene graph supports nested stack, grid, overlay, and absolute composition,
responsive profile variants, validated versioned widgets, and bounded per-slide
art direction. The model never emits executable components, HTML, CSS, or raw
geometry. A deterministic compiler preserves the requested semantic layout family,
then selects a stable content-compatible variant within that family. Cover,
section, split, comparison, sidebar, media, quote, spotlight, canvas, and body
families each have distinct bounded compositions; variation is derived from slide
identity and content rather than random coordinates or mechanical index cycling.
The selected variant and requested family are retained in scene semantics for
diagnostics and future recompilation. Legacy body slides receive an adaptive media
composition only when their outline or blocks would otherwise lose a visual.

The shared scene engine resolves authored constraints into canonical geometry for
the React renderer and PowerPoint exporter. Stack layout uses intrinsic text and
widget sizes before distributing remaining space. Text is fitted to its allocated
box within role-specific font floors and line limits, with overflow recorded as a
scene diagnostic instead of relying on equal-height boxes or target-specific
clipping. The drafting contract also applies slide-capacity limits so detailed
content is distributed across slides rather than reduced to unreadable type.
Scene diagrams consume their semantic nodes in the web viewer, and scene charts,
tables, and diagrams export as native editable PowerPoint objects rather than
generic fallback boxes. Scene documents pass through explicit
normalization rather than the legacy block normalizer. Existing schema-v5 and
older slides remain supported as compatibility inputs. The viewer exposes scene
text nodes as inline editable controls. Text changes use immutable, replayable
commands, synchronize matching replacement roots for responsive layouts, update
existing title/subtitle semantic metadata, and persist through the normalized
whole-slide mutation path. Revert leaves the stored slide untouched, failed saves
retain the local draft, and successful saves flow into later exports and
iteration input. Tables, statistics, quotes, callouts, diagrams, and chart labels
use structured field editors so their data remains native widget content rather
than being flattened into freeform text. The command layer also supports style,
geometry, node insertion/deletion/reordering, and responsive overrides for future
editing surfaces.
The web renderer selects wide, standard, portrait, or compact variants from the
current viewport and updates the resolved scene when the viewport changes.

Scene presentations use document schema version `6` and include the pinned scene
engine version plus explicit canvas dimensions. Schema-version-5 and older
documents remain readable through compatibility normalization. Streaming and
persistence preserve the same canonical document metadata, while iteration always
receives the authoritative current deck and returns scene slides through the same
outline and compiler path. Responsive variant patches and group alignment settings
survive normalization and mutation round trips.

## Web Routing

React Router defines public authentication routes and a signed-in application
area. Protected routes include `/`, `/profile`, `/generate`,
`/generate/research`, `/presentations`, `/presentations/:presentationId`, and
`/purchase`. Presentation-heavy pages are lazy-loaded.
The presentations library renders its header and search controls immediately;
only the results section displays a loading indicator while its database-backed
list request is pending.

The `/presentation` route is retained for an in-progress stream before a saved
presentation ID is available. Navigating between client routes does not cancel
the active stream; only unmounting the application or explicitly stopping the
operation aborts it. Starting another generation is disabled while one is active.
Failed or empty generations open `/presentation-error`, which uses the signed-in
application shell and links back to the saved retry item in the presentation
library. The global stopped-generation control automatically disappears after an
eight-second cooldown, while the failed record remains available until retried or
deleted.

## Direct AI Providers

Presentation generation defaults to the server OpenRouter model and point billing
until a user connects an encrypted OpenAI, Gemini, or Anthropic key. Provider
adapters normalize native streaming events into the existing presentation parser
and SlideSage SSE event contract. Connections and the persisted default model are
managed by `/api/ai` and the protected `/settings` page. Generation requests omit
provider credentials and resolve the saved server-side preference, while the
semantic outline, scene compilation, and cache contract remain
provider-independent. New and replacement credentials are checked against each
provider's official model-list endpoint with caller cancellation and a 15-second
default timeout before encrypted storage. Removing the final valid connection
restores OpenRouter.
The settings route uses the shared loading indicator and exits loading into an
explicit error state when configuration retrieval fails, preventing an indefinite
or visually inconsistent loader. Cloudflare Pages builds without `VITE_API_URL`
fall back to `https://api.slidesage.app` instead of sending `/api/*` requests into
the Pages SPA rewrite. The Worker is routed for apex and `www` API paths and allows
the production Pages origin. Web and Worker deployments remain separate, so any
release that changes `/api/*` routes must deploy the Worker before the matching
Pages bundle.

Research remains an Exa workflow. Requests use caller cancellation and a
10-second default timeout. Timeout and provider failures produce an empty source
set, while explicit caller cancellation propagates so the enclosing request can
stop. Embeddings and semantic memory always use the server OpenRouter
configuration; BYOK credentials are never passed into RAG or search services.
