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

The local stack is defined and coordinated by devenv's native service, task, and
process management:

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

1. The web app submits generation settings, a built-in theme, a presentation-wide
   layout preference, and optional research filters. Layout preferences bias the
   model toward automatic, content-focused, two-column, image-led, or data-led
   composition without exposing arbitrary layout code.
2. When research is enabled, the app-level streaming provider waits on a
   dedicated preview state while Exa sources load. The source preview remains
   visible for review, the request continues if the user leaves the research
   page, completed sources are reused when they return, and generation stays
   disabled until that request finishes.
3. RAG retrieves relevant deck, slide, style, feedback, template, and source
   context from PostgreSQL.
4. OpenRouter produces schema-versioned presentation events. The model returns
   semantic content using the supported slide layouts and content blocks; it does
   not return HTML, CSS, component code, or arbitrary styling.
5. The API streams `created`, generation progress, `saved`, or `error` events.
6. A completed deck and its semantic memories are persisted through Drizzle. A
   failed generation keeps the initial row and replaces its placeholder data with
   an uncharged failed-state payload containing the prompt, options, error, and
   any research sources collected before failure.
7. The app-level streaming provider keeps consuming the response when the user
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
8. The web app treats `saved`, rather than `complete`, as the persistence signal.
   It refreshes an open Presentations page after that event and links the completed
   status to the stored deck.
9. Failed items are marked as ready to retry in Presentations. Clicking one loads
   its detail and routes to the saved sources review when research is available,
   or to the main generation form with its prompt and options preselected.
10. The web viewer renders the deck and can export an editable PowerPoint file in
   the browser.

### Presentation Document

New presentations use schema version `5`. A content slide chooses a semantic
layout from `cover`, `section`, `body`, `split`, `comparison`, `sidebar`,
`media-left`, `media-right`, `quote`, `spotlight`, or `canvas`. Blocks occupy
`main`, `primary`, `secondary`, or `media` regions and contain bounded paragraph,
bullet, table, image, image-placeholder, quote, callout, statistic, or widget
data. The schema adds semantic slide tone, density, and pattern plus bounded block
emphasis and treatment. Optional background images require HTTPS and use named
focal-point and overlay values rather than coordinates or arbitrary styling.
Eyebrows and region labels provide optional narrative context.

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

Generation exposes separate theme and layout-preference dropdowns. The viewer
exposes separate theme and current-slide layout dropdowns; changing to the
image-right layout creates a structured image placeholder when the slide has no
visual block. That layout-owned placeholder is removed when the slide returns to
a single-column layout, while authored placeholders and real images remain.
Viewer changes update the active deck model immediately and are included in the
current PowerPoint export.

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
