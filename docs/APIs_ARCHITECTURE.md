# Architecture

## Workspace

SlideSage is a Bun workspace orchestrated by Nx.

```text
apps/APIs       Hono routes, Better Auth, middleware, and services
apps/Web        React 19 application built by Vite
packages/database
                Drizzle schema, migrations, repositories, token accounting
packages/types  Shared presentation and research contracts
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

## Presentation Flow

1. The web app submits generation settings and optional research filters.
2. Research uses Exa and OpenRouter summarization when enabled.
3. RAG retrieves relevant deck, slide, style, feedback, template, and source
   context from PostgreSQL.
4. OpenRouter produces structured presentation events.
5. The API streams `created`, generation progress, `saved`, or `error` events.
6. The completed deck and its semantic memories are persisted through Drizzle.
7. The web viewer renders the deck and exports it to PDF in the browser.

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
