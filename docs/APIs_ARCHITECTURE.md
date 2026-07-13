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
   Exa sources and the OpenRouter synopsis load. The complete preview remains
   visible for review, and generation stays disabled until that request finishes.
3. RAG retrieves relevant deck, slide, style, feedback, template, and source
   context from PostgreSQL.
4. OpenRouter produces structured presentation events.
5. The API streams `created`, generation progress, `saved`, or `error` events.
6. The completed deck and its semantic memories are persisted through Drizzle.
7. The web viewer renders the deck and exports it to PDF in the browser.

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

## Web Routing

React Router defines public authentication routes and a signed-in application
area. Protected routes include `/`, `/profile`, `/generate`,
`/generate/research`, `/presentations`, `/presentations/:presentationId`, and
`/purchase`. Presentation-heavy pages are lazy-loaded.

The `/presentation` route is retained for an in-progress stream before a saved
presentation ID is available.
