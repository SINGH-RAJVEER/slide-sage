# Monorepo Structure

SlideSage uses a monorepo architecture with Bun workspaces and Turbo for an efficient development workflow.

## Directory Layout

```text
slide-sage/
|-- apps/                     # Applications
|   |-- APIs/                 # Hono API server
|   |   |-- src/
|   |   |   |-- middleware/   # Auth and request middleware
|   |   |   |-- routes/       # API routes
|   |   |   |-- scripts/      # CLI and maintenance scripts
|   |   |   |-- services/     # Core services (AI, auth, profile, search)
|   |   |   |-- utils/        # Helpers
|   |   |   `-- index.ts      # Application entry point
|   |   |-- drizzle/          # Drizzle migrations + snapshots
|   |   |-- drizzle.config.ts # Drizzle config
|   |   |-- biome.json        # Linter/formatter config
|   |   `-- package.json
|   |-- Web/                  # React SPA
|   |   |-- src/
|   |   |   |-- components/   # Shared UI components
|   |   |   |-- contexts/     # React contexts (auth, streaming)
|   |   |   |-- hooks/        # Custom hooks
|   |   |   |-- modules/      # Feature modules
|   |   |   |-- router/       # Router definitions
|   |   |   |-- routes/       # Route-level pages
|   |   |   |-- test/         # Web tests
|   |   |   `-- App.tsx
|   |   `-- package.json
|-- packages/
|   |-- auth/                 # Better Auth client + auth middleware helpers
|   |-- DB/                   # Drizzle schema + repositories
|   `-- contracts/            # Shared API and model contracts
|-- docker/                   # Docker assets
|   |-- dev/                  # Dev Dockerfiles + compose
|   `-- prod/                 # Prod compose + nginx
|   `-- .env.example
|-- docs/                     # Documentation
|-- turbo.json                # Turbo configuration
|-- package.json              # Root workspace configuration
`-- README.md
```

## Workspace Configuration

### Root package.json

```json
{
  "name": "slide-sage-monorepo",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "format": "turbo run format"
  }
}
```

## Technology Stack Overview

### Infrastructure Layer

- **Package Manager**: Bun workspaces for dependency management
- **Build System**: Turbo for task orchestration and caching
- **Runtime**: Bun for both Web and APIs
- **Containerization**: Docker for development and deployment

### Application Layer

- **APIs**: TypeScript + Bun + Hono + Drizzle ORM
- **Web**: React + Vite + Tailwind CSS + Radix UI primitives
- **Database**: PostgreSQL with type-safe queries
- **Authentication**: better-auth with session cookies and OAuth providers

## Benefits

1. **Shared Code**: Database schema and utilities shared across apps
2. **Atomic Commits**: Changes across Web and APIs in one PR
3. **Unified Tooling**: Single configuration for linting and formatting
4. **Code Sharing**: Types shared via packages
5. **Simplified CI/CD**: Build and test everything together
6. **Consistent Environment**: Same versions across all packages

For detailed technology information, see [TECH_STACK.md](TECH_STACK.md).
