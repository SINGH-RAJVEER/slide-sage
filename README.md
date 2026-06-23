# SlideSage

AI-assisted presentation generator that creates professional slides with rich content, charts, and beautiful templates.

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/SINGH-RAJVEER/slide-sage.git
cd slide-sage

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your configuration (see Configuration section)

# Start development with Docker (recommended)
just dev-up-d
# or for manual development
bun dev
```

**Access Application:**

- **Web**: `http://localhost:5173`
- **APIs**: `http://localhost:8000`
- **Database**: `localhost:5432`
- **LiteLLM Proxy**: `http://localhost:4000`

### Docker Development Commands (using Just)

```bash
# List all available commands
just

# Start development environment (attached)
just dev-up

# Start development environment (detached)
just dev-up-d

# View logs (all services)
just dev-logs

# View logs (specific service)
just dev-logs apis
just dev-logs web
just dev-logs database

# Stop development environment
just dev-down

# Reset environment (removes volumes)
just dev-reset
```

### Docker Production Commands

```bash
# Start production environment
just prod-up

# View production logs
just prod-logs

# Stop production environment
just prod-down
```

### Manual Docker Compose

```bash
# Development
docker compose --env-file docker/.env -f docker/dev/docker-compose.dev.yml up

# Production
docker compose --env-file docker/.env -f docker/prod/docker-compose.prod.yml up
```

---

## Key Features

- **AI Generation**: Comprehensive slide decks from simple prompts using LLMs via LiteLLM
- **RAG Integration**: Retrieval Augmented Generation with pgvector for context-aware iterations
- **Smart Charts**: Automatic data visualizations (Bar, Line, Pie, etc.)
- **⚡ Real-time Streaming**: Watch presentations build via Server-Sent Events
- **Professional Templates**: Multiple themes (Modern Dark, Corporate Blue, Minimalist)
- **Secure Authentication**: Email/password or Google OAuth via Better Auth
- **Semantic Search**: Gemini-powered embeddings for intelligent content retrieval
- **Export Support**: Download presentations as editable PPTX files

---

## Documentation

### Docs Index (All Files In `/docs`)

| Document                                                            | Description                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| [**API_OVERVIEW.md**](docs/API_OVERVIEW.md)                         | General API standards and conventions                     |
| [**APIs_ARCHITECTURE.md**](docs/APIs_ARCHITECTURE.md)               | APIs architecture, layers, and boundaries                 |
| [**AUTH_API.md**](docs/AUTH_API.md)                                 | Authentication endpoints and request/response contracts   |
| [**BETTER_AUTH_SETUP.md**](docs/BETTER_AUTH_SETUP.md)               | Better Auth setup and integration details                 |
| [**CODE_STANDARDS.md**](docs/CODE_STANDARDS.md)                     | Coding conventions and best practices                     |
| [**DEVELOPMENT_SETUP.md**](docs/DEVELOPMENT_SETUP.md)               | Local development environment and startup steps           |
| [**EMAIL_VERIFICATION_SETUP.md**](docs/EMAIL_VERIFICATION_SETUP.md) | Email verification flow setup and configuration           |
| [**ENVIRONMENT_VARIABLES.md**](docs/ENVIRONMENT_VARIABLES.md)       | Complete environment variable reference and usage mapping |
| [**MONOREPO_STRUCTURE.md**](docs/MONOREPO_STRUCTURE.md)             | Workspace/monorepo layout and package relationships       |
| [**PRESENTATIONS_API.md**](docs/PRESENTATIONS_API.md)               | Presentation CRUD and generation API details              |
| [**PROFILE_MANAGEMENT.md**](docs/PROFILE_MANAGEMENT.md)             | Profile endpoints and profile data management             |
| [**RAG_IMPLEMENTATION.md**](docs/RAG_IMPLEMENTATION.md)             | RAG architecture, embeddings, and retrieval behavior      |
| [**REQUEST_FLOWS.md**](docs/REQUEST_FLOWS.md)                       | Request lifecycle and sequence diagrams                   |
| [**TECH_STACK.md**](docs/TECH_STACK.md)                             | Technology stack and toolchain decisions                  |
| [**WEB_ROUTING.md**](docs/WEB_ROUTING.md)                           | Web route map and navigation/auth behavior                |

Additional root-level docs:

| Document                   | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| [**AGENTS.md**](AGENTS.md) | AI agent behavior and shell rules for this repository |

---

## 🛠️ Common Commands

### From Root Directory

```bash
bun dev              # Start all development servers (Turbo TUI)
bun dev:stream       # Start all development servers (plain logs)
bun build            # Build all applications
bun lint             # Lint all code
bun format           # Format all code
```

### App-Specific Commands

```bash
# APIs only
bun dev:apis
cd packages/database && bun run db:studio

# Web only
bun dev:web
bun build:web
```

### Database Operations

```bash
cd packages/database
bun run db:push       # Push schema changes
bun run db:migrate    # Run migrations
bun run db:studio     # Open Drizzle Studio
```

### Docker Shell Access

```bash
just db-shell         # PostgreSQL shell
just backend-shell    # Backend container shell
just frontend-shell   # Frontend container shell
```

---

## 🏗️ Project Structure

```text
slide-sage/
├── apps/                     # Applications
│   ├── APIs/                # Hono API server (TypeScript + Drizzle)
│   │   ├── src/            # Source code
│   │   │   ├── routes/    # API route handlers
│   │   │   ├── services/  # Business logic (AI, RAG, search, etc.)
│   │   │   ├── middleware/ # Auth and other middleware
│   │   │   └── scripts/   # Management and test scripts
│   └── Web/                # React SPA (Vite + Tailwind + Shadcn UI)
│       └── src/           # Source code
│           ├── components/ # React components
│           ├── routes/    # Route components
│           ├── contexts/  # React contexts
│           └── hooks/     # Custom hooks
├── packages/               # Shared packages
│   ├── types/         # Shared TypeScript types
│   └── database/      # Database schema, migrations, and repositories
│       ├── drizzle/      # Drizzle migrations and snapshots
│       ├── drizzle.config.ts # Drizzle toolkit configuration
│       ├── src/db/       # Database connection and schema
│       ├── repositories/ # Data access layer
│       ├── services/     # Database-related services
│       └── types/        # Database types
├── docker/                # Docker configuration
│   ├── dev/              # Development Dockerfiles + compose
│   │   ├── backend.Dockerfile
│   │   ├── frontend.Dockerfile
│   │   ├── litellm.Dockerfile
│   │   └── docker-compose.dev.yml
│   ├── prod/             # Production Dockerfiles + compose + nginx config
│   │   ├── backend.Dockerfile
│   │   ├── frontend.Dockerfile
│   │   ├── docker-compose.prod.yml
│   │   └── nginx/
│   └── .env.example
├── docs/                 # Documentation
│   ├── API_OVERVIEW.md             # API standards and overview
│   ├── AUTH_API.md                 # Authentication endpoints
│   ├── PRESENTATIONS_API.md        # Presentation endpoints
│   ├── BETTER_AUTH_SETUP.md        # Better Auth integration
│   ├── RAG_IMPLEMENTATION.md       # RAG system details
│   ├── MONOREPO_STRUCTURE.md       # Workspace structure
│   ├── TECH_STACK.md               # Technology stack details
│   ├── APIs_ARCHITECTURE.md        # APIs layers
│   ├── REQUEST_FLOWS.md            # Request flow diagrams
│   ├── DEVELOPMENT_SETUP.md        # Environment setup guide
│   ├── EMAIL_VERIFICATION_SETUP.md # Email verification setup
│   ├── ENVIRONMENT_VARIABLES.md    # Environment variable reference
│   ├── PROFILE_MANAGEMENT.md       # Profile API and data management
│   ├── CODE_STANDARDS.md           # Coding standards
│   └── WEB_ROUTING.md              # Web routing configuration
├── AGENTS.md              # AI agent behavior guidelines
├── MIGRATION_GUIDE.md     # Gemini embeddings migration
├── Justfile              # Docker management commands
├── litellm_config.yaml   # LiteLLM proxy configuration
├── turbo.json            # Turbo build system config
├── package.json          # Root workspace configuration
└── bun.lock             # Bun lockfile
```

### Technology Stack

- **Package Manager**: Bun workspaces for dependency management
- **Build System**: Turbo for task orchestration and caching
- **APIs**: TypeScript + Bun + Hono + Drizzle ORM + PostgreSQL
- **Web**: React + Vite + Tailwind CSS + Shadcn UI
- **Authentication**: Better Auth with email/password and Google OAuth
- **AI/LLM**: LiteLLM proxy for flexible model routing (Groq, Gemini, etc.)
- **RAG**: pgvector for semantic search with Gemini text-embedding-004 (768 dims)
- **Infrastructure**: Docker with multi-stage builds and optimized images
- **Database**: PostgreSQL 16 Alpine with pgvector extension
- **Task Runner**: Just (justfile) for Docker workflow automation
- **Production**: Nginx reverse proxy with SSL support

---

## 🔄 Development Workflow

### 1. Feature Development

1. **Plan**: Review [REQUEST_FLOWS.md](docs/REQUEST_FLOWS.md)
2. **Setup**: Follow [DEVELOPMENT_SETUP.md](docs/DEVELOPMENT_SETUP.md)
3. **Code**: Follow [CODE_STANDARDS.md](docs/CODE_STANDARDS.md)
4. **Test**: Use test commands and follow guidelines
5. **Review**: Check code quality and standards

### 2. API Development

1. **Design**: Reference [API_OVERVIEW.md](docs/API_OVERVIEW.md)
2. **APIs**: Follow [APIs_ARCHITECTURE.md](docs/APIs_ARCHITECTURE.md)
3. **Documentation**: Update appropriate API docs:
   - [AUTH_API.md](docs/AUTH_API.md) for authentication
   - [PRESENTATIONS_API.md](docs/PRESENTATIONS_API.md) for presentations

### 3. Deployment

1. **Local Development**: Use `just dev-up-d` to start all services
2. **Production**: Deploy with `just prod-up`, or manually run `docker compose --env-file docker/.env -f docker/prod/docker-compose.prod.yml up -d`
3. **Docker Management**: See [DEVELOPMENT_SETUP.md](docs/DEVELOPMENT_SETUP.md)
4. **CI/CD**: Use automated pipelines and monitoring

---

## 🔧 Configuration

### Environment Variables

Docker workflows use `docker/.env`:

```bash
# Copy example configuration
cp docker/.env.example docker/.env

# Database Configuration
DATABASE_URL=postgresql://slidesage:slidesage@localhost:5432/slidesage
POSTGRES_USER=slidesage
POSTGRES_PASSWORD=slidesage
POSTGRES_DB=slidesage

# APIs Configuration
PORT=8000
BASE_URL=http://localhost:8000
JWT_SECRET_KEY=change-this-secret-key-in-production

# AI / LLM Configuration
LITELLM_BASE_URL=http://localhost:4000
LITELLM_MODEL=groq/llama-3.3-70b-versatile
EMBEDDING_MODEL=gemini/text-embedding-004

# API Keys
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key

# Better Auth / OAuth
BETTER_AUTH_SECRET=change-this-secret-key-in-production
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret

# Web Configuration
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id

# CORS
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

**Key Configuration Notes:**

- `LITELLM_BASE_URL`: Points to LiteLLM proxy service for unified LLM access
- `EMBEDDING_MODEL`: Gemini text-embedding-004 (768 dimensions) for RAG
- See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for embedding model migration details
- See [litellm_config.yaml](litellm_config.yaml) for LiteLLM proxy configuration

---

## 📝 Notes & Troubleshooting

### Common Issues

- **Database Connection**: Ensure PostgreSQL is running and `DATABASE_URL` is correct
- **pgvector Extension**: If RAG features fail, ensure PostgreSQL has pgvector installed
- **Web API**: Verify `VITE_API_URL` matches APIs port (default: 8000)
- **Authentication**: Check that `JWT_SECRET_KEY` and `BETTER_AUTH_SECRET` are set
- **LiteLLM Issues**:
  - Verify LiteLLM service is running on port 4000
  - Check API keys in environment variables (GROQ_API_KEY, GEMINI_API_KEY)
  - Review [litellm_config.yaml](litellm_config.yaml) for model configuration
- **RAG/Embedding Failures**:
  - Ensure `GEMINI_API_KEY` is valid
  - Check embedding dimensions (should be 768 for Gemini)
  - See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for migration help
- **Docker Issues**:
  - Check that `.env` file exists in project root
  - Ensure Docker is running and has sufficient permissions
  - Try `just dev-reset` to reset containers and volumes

### Getting Help

1. **Check Documentation**: Start with relevant docs in `/docs` folder
2. **Review Logs**: Use `just dev-logs` or `just dev-logs <service>` for service-specific logs
3. **Test API**: Use `/` endpoint to verify APIs health
4. **Test RAG**: Run `cd apps/APIs && bash -lc 'bun run src/scripts/test-rag.ts'`
5. **Validate Setup**: Ensure all required environment variables are configured

---

## 🎯 Monorepo Benefits

- **🔄 Shared Dependencies**: Common packages managed centrally
- **⚡ Parallel Development**: Multiple apps developed simultaneously
- **🔧 Unified Tooling**: Single configuration for linting, formatting
- **📦 Atomic Commits**: Changes across Web and APIs in one PR
- **🚀 Simplified CI/CD**: Build and test everything together
- **💡 Code Sharing**: Easy sharing of types and utilities

---

## 📖 Documentation Guide

- **New to project?** → Start with [DEVELOPMENT_SETUP.md](docs/DEVELOPMENT_SETUP.md)
- **Adding features?** → Read [CODE_STANDARDS.md](docs/CODE_STANDARDS.md)
- **Working with API?** → Check [API_OVERVIEW.md](docs/API_OVERVIEW.md) first
- **Implementing RAG?** → See [RAG_IMPLEMENTATION.md](docs/RAG_IMPLEMENTATION.md)
- **Setting up auth?** → Follow [BETTER_AUTH_SETUP.md](docs/BETTER_AUTH_SETUP.md)
- **Configuring env vars?** → Use [ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)
- **Setting up email verification?** → Use [EMAIL_VERIFICATION_SETUP.md](docs/EMAIL_VERIFICATION_SETUP.md)
- **Working on profiles?** → See [PROFILE_MANAGEMENT.md](docs/PROFILE_MANAGEMENT.md)
- **Need architecture info?** → See [MONOREPO_STRUCTURE.md](docs/MONOREPO_STRUCTURE.md)
- **Working with AI agents?** → Review [AGENTS.md](AGENTS.md)

---

## 🤝 Contributing

1. **Follow Standards**: Adhere to [CODE_STANDARDS.md](docs/CODE_STANDARDS.md)
2. **Update Documentation**: Keep API docs current when making changes
3. **Test Thoroughly**: Ensure tests pass for new features
4. **Use Conventional Commits**: Follow the commit message format in standards

---
