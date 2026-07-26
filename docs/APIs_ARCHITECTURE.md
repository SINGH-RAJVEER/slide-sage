# Architecture

## Workspace

SlideSage is a Bun workspace.

```text
apps/APIs          Hono routes, Better Auth, middleware, and services
apps/Web           React 19 application built by Vite
packages/database  Drizzle schema, migrations, repositories, token accounting
packages/types     Shared API, presentation, research, profile, and billing contracts
```

Biome handles formatting and linting. Bun's test runner executes both API and web tests; API tests use isolation because modules hold database and auth state.

## Runtime

The local stack is defined and coordinated by devenv's native service, task, and process management:

```text
PostgreSQL ready -> Drizzle migrations complete -> API starts -> Vite web starts
```

PostgreSQL 17 includes pgvector. Local dev state is stored in `.devenv/state/postgres/`.

The production API entry point is `apps/APIs/src/index.ts`. Authentication is implemented in `apps/APIs/src/services/auth.ts` and its middleware companion, so the Worker deploy does not depend on a separate auth workspace package. The API mounts:

- Better Auth at `/api/auth`
- Profile routes at `/api/profile`
- Presentation and research routes at `/api`
- Billing routes at `/api/billing`

Authenticated routes validate the Better Auth session cookie. Presentation generation and revision check the user's slide-token balance before opening an SSE stream.

Transport contracts shared by the Worker and web app belong in `packages/types`. This includes presentation list/detail responses, profile requests and responses, billing checkout and verification payloads, common API errors, and streaming events. Database row types remain in `packages/database`, while component props and service-only implementation types stay with their owning modules.

## Presentation Flow

1. The web app submits generation settings, a built-in theme, and optional
   research filters. Layout and composition are selected automatically from each
   slide's content and narrative purpose.
2. When research is enabled, the app-level streaming provider waits on a
   dedicated preview state while Exa sources load. The source preview remains
   visible for review, the request continues if the user leaves the research
   page, completed sources are reused when they return, and generation stays
   disabled until that request finishes.
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
6. The API streams `created`, `stage`, `outline`, slide progress, `saved`, or
   `error` events.
7. A completed deck and its semantic memories are persisted through Drizzle. A
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
- `semantic_cache_entries`

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
geometry. A deterministic compiler selects and authors the scene from narrative
role, visual intent, semantic blocks, available assets, and slide position.

The shared scene engine resolves authored constraints into canonical geometry for
the React renderer and PowerPoint exporter. Scene documents pass through explicit
normalization rather than the legacy block normalizer. Existing schema-v5 and
older slides remain supported as compatibility inputs. Scene editing uses
immutable, replayable commands for text, style, geometry, node
insertion/deletion/reordering, and responsive overrides.
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
provider-independent. Removing the final valid connection restores OpenRouter.

Research remains an Exa workflow. Embeddings and semantic memory always use the
server OpenRouter configuration; BYOK credentials are never passed into RAG or
search services.
