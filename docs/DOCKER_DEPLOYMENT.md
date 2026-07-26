# Production Docker Deployment

The production Compose stack contains four services:

| Service | Purpose | Published port |
| --- | --- | --- |
| `postgres` | PostgreSQL 17 with pgvector and persistent storage | None |
| `migrate` | One-shot Drizzle migration run before the API starts | None |
| `api` | Bun and Hono application server | None |
| `nginx` | Static web server and `/api/*` reverse proxy | `HTTP_PORT`, default `80` |

Only Nginx is exposed on the host. PostgreSQL and the API communicate over the
private Compose network.

## Configure

The stack reads only the repository-root `.env`. Create it from the tracked root
template if it does not already exist:

```bash
install -m 600 .env.example .env
```

At minimum, replace these values before starting the stack:

- `POSTGRES_PASSWORD`
- `BASE_URL`, `CORS_ORIGINS`, and `BETTER_AUTH_TRUSTED_ORIGINS`
- `AUTH_SECRET` with at least 32 random characters
- `OPEN_ROUTER_API_KEY`
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for production email authentication

Generate suitable random values with:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

The first command is suitable for `AUTH_SECRET`. The second can be used for
`BYOK_ENCRYPTION_KEY_V1`; retain old versioned BYOK keys during key rotation.
Keep `VITE_API_URL` empty so browser requests use the same Nginx origin.

Compose derives the container `DATABASE_URL` from `POSTGRES_USER`,
`POSTGRES_PASSWORD`, and `POSTGRES_DB`, using `postgres` as the service hostname.
Use a URL-safe password, such as the hexadecimal output above. The local
`DATABASE_URL` value in the root `.env` is overridden inside the API and migration
containers.

## Start

Build and start the stack from the repository root:

```bash
just docker
```

This recipe runs:

```bash
docker compose --env-file .env -f docker/compose.yaml up --build -d
```

Compose waits for PostgreSQL, applies all pending migrations, waits for the API
health check, and then starts Nginx. Inspect service state and logs with:

```bash
docker compose --env-file .env -f docker/compose.yaml ps
docker compose --env-file .env -f docker/compose.yaml logs -f api nginx
```

Stop containers without deleting database data:

```bash
docker compose --env-file .env -f docker/compose.yaml down
```

The `postgres-data` named volume persists the database. Removing the stack with
`down --volumes` permanently deletes that volume and must not be used without a
verified backup.

## Update

After pulling application changes, rebuild and recreate the stack:

```bash
docker compose --env-file .env -f docker/compose.yaml up --build -d
```

Dependency layers are keyed by `package.json` files and `bun.lock`, and Bun's
download cache is mounted with BuildKit. Source-only changes therefore avoid a
full dependency installation. The API and migration targets share cached build
stages, while the final API and Nginx images contain only their runtime files.

To apply migrations independently:

```bash
docker compose --env-file .env -f docker/compose.yaml run --rm migrate
```

Back up PostgreSQL before migration or image upgrades. Restore and upgrade tests
should use a copy of production data before deployment.

## TLS And Proxying

The included Nginx server listens for HTTP on container port `8080` and is mapped
to host port `HTTP_PORT`. Terminate TLS at a load balancer, ingress, or host-level
TLS proxy, then forward traffic to that port. Set `BASE_URL` and trusted origins
to the public HTTPS URL.

Nginx serves the Vite SPA with history fallback and proxies `/api/*` to the Bun
service. Proxy buffering is disabled and timeouts are extended so generation
server-sent events are delivered without batching.

## Production Operations

- Keep the root `.env` outside version control and restrict it to the deployment user.
- Back up the `postgres-data` volume on a tested schedule.
- Pin images by digest in controlled environments that require fully reproducible supply chains.
- Place the service behind TLS before handling authentication or billing traffic.
- Monitor API health, PostgreSQL capacity, migration exits, and long-lived generation requests.
