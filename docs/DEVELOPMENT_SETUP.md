# Development Setup

Complete guide to setting up the SlideSage development environment.

## Prerequisites

### Required Software

- **Bun** (1.3.10+): Package manager and runtime
- **Docker** & **Docker Compose**: Container management
- **Git**: Version control

### Optional but Recommended

- **PostgreSQL Client**: For direct database access
- **VS Code**: Recommended IDE with extensions

### Installation Commands

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install Docker (Linux)
sudo apt update
sudo apt install docker.io

# Verify installations
bun --version
docker --version
docker compose version
```

## Initial Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-username/slide-sage.git
cd slide-sage
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
bun install

# This installs dependencies for:
# - Root workspace (turbo, prettier)
# - APIs app
# - Web app
```

### 3. Configure Environment Variables

#### Environment File Sources

- Docker services read variables from `docker/.env`.
- Manual dev servers (`bun dev`) read variables from the repo root `.env`.

```bash
# Copy the Docker environment file
cp docker/.env.example docker/.env

# Edit with your configuration
nano docker/.env
```

**Key Variables:**

```bash
# APIs base configuration
PORT=8000
DATABASE_URL=postgresql://slidesage:slidesage@localhost:5432/slidesage
CORS_ORIGINS=http://localhost:5173

# better-auth
AUTH_SECRET=your-secret-key-change-in-production
AUTH_URL=http://localhost:8000

# OAuth providers
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Email delivery
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=onboarding@yourdomain.com

# AI providers
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key
OPENAI_API_KEY=

# LiteLLM configuration
LITELLM_MODEL=groq/llama-3.3-70b-versatile
LITELLM_SEARCH_MODEL=llama-3.1-8b-instant
LITELLM_PROXY_BASE=http://localhost:4000
```

#### Local Root `.env` (Manual Runs)

If you are running services manually (without Docker), create a root `.env` file:

```bash
# Repo root .env (used by manual bun/turbo runs)
PORT=8000
DATABASE_URL=postgresql://slidesage:slidesage@localhost:5432/slidesage
CORS_ORIGINS=http://localhost:5173
VITE_API_URL=http://localhost:8000
```

### 4. Start Development Services

#### Option A: Docker (Recommended)

```bash
# Start all services with Docker
docker compose --env-file docker/.env -f docker/dev/docker-compose.dev.yml up --build

# Services started:
# - slide-sage-web (port 5173)
# - slide-sage-apis (port 8000)
# - slide-sage-postgres (port 5432)
```

#### Option B: Local Development

```bash
# Start PostgreSQL (if running locally)
docker compose --env-file docker/.env -f docker/dev/docker-compose.dev.yml up database -d

# Start development servers
bun dev

# Or start individual services:
turbo run dev --filter=APIs
turbo run dev --filter=Web
```

## Verify Setup

### Check Services

```bash
# Test APIs health
curl http://localhost:8000/health

# Check Web (open in browser)
open http://localhost:5173

# Verify database connection
cd apps/APIs && bun run db:studio
```

### Expected Responses

#### Health Check

```json
{
  "status": "healthy",
  "message": "SlideSage API is running",
  "timestamp": "2026-01-04T12:00:00Z"
}
```

#### Web Loading

- React development server should load
- No 404 errors in console
- API calls should connect to APIs

## IDE Configuration

### VS Code Extensions (Recommended)

```json
{
  "recommendations": [
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-json",
    "ms-vscode.vscode-docker"
  ]
}
```

### VS Code Settings

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Find process using port
lsof -i :8000  # APIs
lsof -i :5173  # Web

# Kill process
kill -9 <PID>

# Or change ports in docker/.env
echo "PORT=8001" >> docker/.env
```

#### Database Connection Failed

```bash
# Check if database is running
docker compose --env-file docker/.env -f docker/dev/docker-compose.dev.yml ps

# Restart database
docker compose --env-file docker/.env -f docker/dev/docker-compose.dev.yml restart database

# Check database logs
docker compose --env-file docker/.env -f docker/dev/docker-compose.dev.yml logs database

# Test connection manually
psql postgresql://user:password@localhost:5432/slide_sage
```

If logs show `FATAL: role "slidesage" does not exist`, your Postgres volume was likely initialized from older credentials.

```bash
# Recreate dev services and reset Postgres volume
just dev-reset
just ddu-d
```

Or create the expected role/database without wiping data:

```bash
docker exec slide-sage-postgres-dev psql -U postgres -d postgres -c "CREATE ROLE slidesage LOGIN PASSWORD 'slidesage';"
docker exec slide-sage-postgres-dev psql -U postgres -d postgres -c "CREATE DATABASE slidesage OWNER slidesage;"
```

If migrations fail with `permission denied to create extension "vector"`, run:

```bash
docker exec slide-sage-postgres-dev psql -U postgres -d slidesage -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

#### Dependency Installation Failed

```bash
# Clear cache and reinstall
rm -rf node_modules
bun install

# Clear Bun cache
bun pm cache rm
bun install
```

#### Web Build Errors

```bash
# Clear Vite cache
cd apps/Web
rm -rf .vite
bun dev

# Check TypeScript errors
bun run build
```

#### Docker Web Proxy ECONNREFUSED

If Vite logs `http proxy error: /api/... ECONNREFUSED` in Docker, verify Web is using the Docker network target (`http://apis:8000`) rather than `http://localhost:8000`. The dev compose file is preconfigured for this.

## Development Tools

### Useful Commands

```bash
# Database operations
cd apps/APIs
bun run db:push      # Push schema changes
bun run db:studio    # Open Drizzle Studio
bun run db:generate  # Generate migrations

# Code quality
bun lint            # Lint all code
bun format          # Format all code
bun build           # Build all apps

# Individual app commands
bun run dev:apis
bun run dev:web
```

### Database Management

```bash
# View tables and data
cd apps/APIs
bun run db:studio

# Reset database (development only)
bun run db:migrate  # Run migrations
# Or manually reset via:
# docker compose --env-file docker/.env -f docker/dev/docker-compose.dev.yml down database
# docker compose --env-file docker/.env -f docker/dev/docker-compose.dev.yml up database
```

## Next Steps

After setup is complete:

1. **Create Test User**: Register via the Web UI
2. **Generate Presentation**: Try the AI generation feature
3. **Explore Codebase**: Read the architecture documentation
4. **Set Up Testing**: Configure test environment

For request flow diagrams, see [REQUEST_FLOWS.md](REQUEST_FLOWS.md).
