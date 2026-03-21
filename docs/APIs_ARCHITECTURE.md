# APIs Architecture

Architecture overview for the SlideSage APIs service.

## Layer Architecture

```text
+-----------------------------------------------------------+
| Hono Application                                          |
|  +-----------------------------------------------------+  |
|  | Middleware                                          |  |
|  |  - CORS (credentials enabled)                       |  |
|  |  - Logger                                           |  |
|  |  - Auth (session cookie validation)                 |  |
|  |  - Error handling                                   |  |
|  +-----------------------------------------------------+  |
|                            |                              |
|  +-----------------------------------------------------+  |
|  | Route Handlers                                      |  |
|  |  - /api/auth (better-auth + email verification)     |  |
|  |  - /api/profile                                     |  |
|  |  - /api (presentations + research)                  |  |
|  |  - /api/billing (placeholder)                       |  |
|  +-----------------------------------------------------+  |
+-----------------------------------------------------------+
                            |
                            v
+-----------------------------------------------------------+
| Service Layer                                             |
|  - PresentationService                                    |
|  - AIService                                              |
|  - SearchService                                          |
|  - ProfileService                                         |
|  - EmailAuthService (verification codes)                  |
|  - better-auth (session handling)                         |
+-----------------------------------------------------------+
                            |
                            v
+-----------------------------------------------------------+
| Data Layer                                                |
|  packages/DB (Drizzle ORM)                                |
|  - users, accounts, sessions, verifications               |
|  - presentations                                          |
|  - search_embeddings, presentation_embeddings, rag_context|
+-----------------------------------------------------------+
                            |
                            v
+-----------------------------------------------------------+
| PostgreSQL Database                                       |
+-----------------------------------------------------------+
```

## Route Handler Layer

### Auth Routes (email verification + better-auth)

```typescript
// apps/APIs/src/routes/auth.routes.ts
const authRoutes = new Hono();

authRoutes.post("/signup/email", async (c) => {
  // Create user and send verification code
});

authRoutes.post("/verify-code", async (c) => {
  // Verify email code
});

authRoutes.post("/resend-code", async (c) => {
  // Resend verification code
});

// All other auth routes are handled by better-auth
authRoutes.all("/*", (c) => authClient.handler(c.req.raw));
```

### Presentation Routes (SSE streaming)

```typescript
// apps/APIs/src/routes/presentation.routes.ts
presentations.post(
  "/generate-presentation-stream",
  authMiddleware,
  async (c) => {
    return stream(c, async (stream) => {
      // SSE: created, theme, slide, complete, saved
    });
  },
);
```

## Middleware Layer

### Session-based Authentication

```typescript
// packages/auth/src/middleware.ts
const sessionCookie = getCookie(c, "better-auth.session_token");
if (!sessionCookie) {
  return c.json({ error: { message: "Unauthorized" } }, 401);
}
```

Auth setup is abstracted into the shared `@slide-sage/auth` package (Better Auth client + middleware helpers), which is consumed by `apps/APIs`.

## Database Layer

The database schema lives in `packages/DB/src/db/schema.ts` and aligns with better-auth.

```typescript
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  slideTokens: real("slide_tokens").notNull().default(50.0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});
```

## Configuration

For Docker runs, environment variables come from `docker/.env` through compose.
For manual runs, the APIs service loads `.env` at the repo root.

Key variables:

- `AUTH_SECRET`, `BASE_URL`
- `DATABASE_URL`
- `CORS_ORIGINS`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`
- `LITELLM_MODEL`, `LITELLM_PROXY_BASE`, `LITELLM_SEARCH_MODEL`

## Serving Model

The APIs service is API-only and does not serve frontend static assets.

- API routes are mounted under `/api/*`.
- Unknown non-API routes return the standard JSON 404 response from Hono.
- Frontend assets and SPA routing should be handled by the dedicated Web deployment/runtime.

For request flow diagrams, see [REQUEST_FLOWS.md](REQUEST_FLOWS.md).
