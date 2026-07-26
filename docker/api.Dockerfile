# syntax=docker/dockerfile:1.7

ARG BUN_VERSION=1.3.10

FROM oven/bun:${BUN_VERSION}-alpine AS manifests
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/APIs/package.json ./apps/APIs/package.json
COPY apps/Web/package.json ./apps/Web/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/types/package.json ./packages/types/package.json

FROM manifests AS production-dependencies
RUN --mount=type=cache,id=slidesage-bun,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --production \
        --filter slide-sage-apis \
        --filter @slide-sage/database \
        --filter @slide-sage/types

FROM manifests AS migration-dependencies
RUN --mount=type=cache,id=slidesage-bun,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile \
        --filter @slide-sage/database \
        --filter @slide-sage/types

FROM oven/bun:${BUN_VERSION}-alpine AS source
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/APIs/package.json ./apps/APIs/package.json
COPY apps/APIs/src ./apps/APIs/src
COPY packages/database/package.json ./packages/database/package.json
COPY packages/database/src ./packages/database/src
COPY packages/types/package.json ./packages/types/package.json
COPY packages/types/src ./packages/types/src

FROM source AS api
COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=bun:bun /app/apps/APIs/node_modules ./apps/APIs/node_modules
COPY --from=production-dependencies --chown=bun:bun /app/packages/database/node_modules ./packages/database/node_modules

ENV NODE_ENV=production \
    PORT=8000

USER bun
EXPOSE 8000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["bun", "-e", "const response = await fetch('http://127.0.0.1:8000/'); process.exit(response.ok ? 0 : 1)"]
CMD ["bun", "apps/APIs/src/index.ts"]

FROM source AS migration
COPY --from=migration-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=migration-dependencies --chown=bun:bun /app/packages/database/node_modules ./packages/database/node_modules
COPY packages/database/drizzle.config.ts ./packages/database/drizzle.config.ts
COPY packages/database/drizzle ./packages/database/drizzle

ENV NODE_ENV=production

USER bun
CMD ["bun", "--cwd", "packages/database", "run", "db:migrate"]
