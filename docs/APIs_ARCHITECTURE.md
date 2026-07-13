# Architecture

## Workspace

SlideSage is a native Bun workspace. Root scripts coordinate commands across
applications and shared packages directly through Bun.

```text
apps/APIs       Hono routes, Better Auth, middleware, and services
apps/Web        React 19 application built by Vite
packages/database
                Drizzle schema, migrations, repositories, token accounting
packages/types  Shared API, presentation, research, profile, and billing contracts
```

Biome handles formatting and linting. Bun's test runner executes both API and web
tests; API tests use isolation because modules hold database and auth state.

## Runtime

The local stack is defined in `devenv.nix` and coordinated by process-compose:

```text
PostgreSQL ready -> Drizzle migrations complete -> API starts
                                           Vite web starts
```

PostgreSQL 17 includes pgvector. Local state is stored in
`.devenv/state/postgres/`.

The production API entry point is `apps/APIs/src/index.ts`. Authentication is
implemented in `apps/APIs/src/services/auth.ts` and its middleware companion, so
the Worker deploy does not depend on a separate auth workspace package. The API
mounts:

- Better Auth at `/api/auth`
- Profile routes at `/api/profile`
- Presentation and research routes at `/api`
- Billing routes at `/api/billing`

Authenticated routes validate the Better Auth session cookie. Presentation
generation and revision check the user's slide-token balance before opening an
SSE stream.

Transport contracts shared by the Worker and web app belong in
`packages/types`. This includes presentation list/detail responses, profile
requests and responses, billing checkout and verification payloads, common API
errors, and streaming events. Database row types remain in `packages/database`,
while component props and service-only implementation types stay with their
owning modules.

## Presentation Flow

1. The web app submits generation settings and optional research filters.
2. When research is enabled, the web app waits on a dedicated preview state while
   Exa sources load. The source preview remains visible for review, and generation
   stays disabled until that request finishes.
3. RAG retrieves relevant deck, slide, style, feedback, template, and source
   context from PostgreSQL.
4. OpenRouter produces structured presentation events.
5. The API streams `created`, generation progress, `saved`, or `error` events.
6. A completed deck and its semantic memories are persisted through Drizzle. A
   failed generation keeps the initial row and replaces its placeholder data with
   an uncharged failed-state payload containing the prompt, options, error, and
   any research sources collected before failure.
7. The app-level streaming provider keeps consuming the response when the user
   navigates to another route. A persistent status control returns to the live
   viewer and reports generated-slide progress.
8. The web app treats `saved`, rather than `complete`, as the persistence signal.
   It refreshes an open Presentations page after that event and links the completed
   status to the stored deck.
9. Failed items are marked as ready to retry in Presentations. Clicking one loads
   its detail and routes to the saved sources review when research is available,
   or to the main generation form with its prompt and options preselected.
10. The web viewer renders the deck and can export an editable PowerPoint file in
   the browser.

### Editable PowerPoint Export

The viewer passes the complete presentation model to the browser-side PPTX
builder. Export does not depend on mounted carousel slides and does not capture
slide screenshots. HTML slide semantics are mapped to native PowerPoint text
boxes, lists, tables, shapes, and images. Chart slides become native PowerPoint
charts with their category and series data retained for editing.

The export uses a widescreen 16:9 layout and maps each Slide Sage theme to a
PowerPoint-safe color and font palette. Images are embedded when the browser can
fetch them; a failed or cross-origin image becomes an editable labeled
placeholder so it does not abort the deck. PowerPoint has no polar-area chart
type, so those charts are exported as editable radar charts. The downloaded file
uses the presentation title and the `.pptx` extension.

The Cloudflare Worker creates its Postgres.js client inside each request and
keeps Drizzle access scoped to that invocation. Database clients must not be
cached across Worker requests because Cloudflare isolates request I/O contexts.

Iteration follows the same path but uses an existing presentation and user
feedback as context.

## Data

The Drizzle schema includes Better Auth tables, presentations, payments, and the
semantic-memory tables:

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

The public schema entry point remains `packages/database/src/db/schema.ts`. It
re-exports domain modules from `packages/database/src/db/schema/`: authentication,
presentations, billing, RAG context, slide memory, source memory, generation
memory, style memory, and cross-domain relations. Add tables and inferred types
to the matching domain module, and define relationships that cross modules in
`relations.ts`.

Repository classes own persistence. Route handlers should validate HTTP input and
translate service results, while AI, research, RAG, profile, and billing logic
remain in services.

`apps/APIs/src/services/ai.service.ts` is the stable presentation-AI facade. Its
supporting `services/ai/` modules separately own message construction, research
source resolution, presentation-content normalization, and resilient OpenRouter
stream orchestration. Keep provider transport and retry behavior out of the
facade so generation and iteration share one streaming implementation.

## Web Routing

React Router defines public authentication routes and a signed-in application
area. Protected routes include `/`, `/profile`, `/generate`,
`/generate/research`, `/presentations`, `/presentations/:presentationId`, and
`/purchase`. Presentation-heavy pages are lazy-loaded.

The `/presentation` route is retained for an in-progress stream before a saved
presentation ID is available. Navigating between client routes does not cancel
the active stream; only unmounting the application or explicitly stopping the
operation aborts it. Starting another generation is disabled while one is active.
Failed or empty generations open `/presentation-error`, which uses the signed-in
application shell and links back to the saved retry item in the presentation
library. The global stopped-generation control automatically disappears after an
eight-second cooldown, while the failed record remains available until retried or
deleted.
