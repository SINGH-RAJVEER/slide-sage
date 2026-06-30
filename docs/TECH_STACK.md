# Technology Stack

Detailed overview of technologies used in SlideSage monorepo.

## Infrastructure Technologies

### Package Manager: Bun

- **Version**: 1.0+
- **Purpose**: Package management, runtime, and task runner
- **Benefits**: 3x faster than npm, native TypeScript support, built-in workspace support
- **Configuration**: Root `package.json` with workspaces configuration

### Build System: Turbo

- **Purpose**: Task orchestration, caching, and parallel execution
- **Features**:
  - Intelligent caching based on file dependencies
  - Parallel task execution when possible
  - Dependency-aware build order
  - Selective task execution with `--filter`

### Containerization: Docker

- **Purpose**: Development environment and deployment
- **Services**: Web, APIs, Database
- **Configuration**:
  - `docker/dev/docker-compose.dev.yml` for development
  - `docker/prod/docker-compose.prod.yml` for production

## APIs Stack

### Runtime: Bun

```typescript
// High-performance JavaScript runtime
// 3x faster startup than Node.js
// Lower memory footprint (~30MB vs ~80MB)
// Native TypeScript support
```

### Framework: Hono

- **Version**: 4.6+
- **Purpose**: Fast web framework optimized for Bun
- **Features**:
  - Express-like API
  - Built-in middleware support
  - TypeScript first-class support
  - Fast HTTP handling

### ORM: Drizzle

- **Version**: 0.36+
- **Purpose**: Type-safe database queries
- **Features**:
  - SQL-like query builder
  - Type-safe schema definitions
  - Automatic type inference
  - Migration support

### Database: PostgreSQL

- **Version**: 16+
- **Purpose**: Persistent data storage
- **Features**:
  - ACID compliance
  - JSONB support for flexible data
  - Full-text search
  - Connection pooling

## Web Stack

### Framework: React

- **Version**: 19+
- **Purpose**: Component-based UI library
- **Features**:
  - Functional components with hooks
  - Concurrent features
  - Developer tools support

### Build Tool: Vite

- **Purpose**: Fast development server and bundler
- **Features**:
  - HMR (Hot Module Replacement)
  - Fast cold starts
  - Optimized builds
  - Plugin ecosystem

### Styling: Tailwind CSS

- **Version**: 4.0+
- **Purpose**: Utility-first CSS framework
- **Features**:
  - Utility classes for rapid development
  - Responsive design utilities
  - Custom theme support
  - JIT compilation

### Component Library: Shadcn UI

- **Purpose**: High-quality React components
- **Features**:
  - Accessible components
  - TypeScript support
  - Customizable themes
  - Modern design system

### Icons: Lucide React

- **Purpose**: Beautiful icon library
- **Features**:
  - Tree-shakeable icons
  - Multiple styles
  - Consistent design
  - TypeScript support

## Development Tools

### Linter/Formatter: Biome

- **Purpose**: Fast linting and formatting
- **Features**:
  - JavaScript/TypeScript support
  - JSON formatting
  - Fast performance
  - Configurable rules

### Testing: Bun Test

- **Purpose**: Built-in test runner
- **Features**:
  - Jest-compatible API
  - Fast test execution
  - Built-in mocking
  - Watch mode

## Authentication & Security

### Authentication: better-auth

- **Purpose**: Session-based authentication for APIs and Web
- **Features**:
  - Cookie-based sessions (`better-auth.session_token`)
  - Email/password sign-in
  - OAuth providers (Google, GitHub)
  - Drizzle adapter for PostgreSQL

### Email Delivery: Resend

- **Purpose**: Verification and transactional email delivery
- **Features**:
  - API-driven email sending
  - Used for verification code delivery

## AI Integration

### OpenRouter

- **Purpose**: Unified LLM and embedding API interface
- **Features**:
  - Multiple model provider routing
  - OpenAI-compatible chat and embeddings endpoints
  - Error handling
  - Cost tracking

## Performance Characteristics

| Technology   | Startup Time | Memory Usage | Request Throughput |
| ------------ | ------------ | ------------ | ------------------ |
| Bun Runtime  | 0.3s         | ~30MB        | High               |
| Node.js      | 2.1s         | ~80MB        | Medium             |
| Python Flask | 3.5s         | ~120MB       | Low                |

## Version Management

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node"
  }
}
```

### Dependency Management

- **Workspace Dependencies**: Shared between apps
- **App-Specific Dependencies**: Individual app requirements
- **Dev Dependencies**: Development tools and testing
- **Peer Dependencies**: Runtime compatibility

For monorepo structure details, see [MONOREPO_STRUCTURE.md](MONOREPO_STRUCTURE.md).
