FROM oven/bun:1.3.6 AS base
WORKDIR /app

ENV BUN_INSTALL_CACHE_DIR=/root/.bun/install/cache

FROM base AS workspace-manifests

COPY package.json ./
COPY bun.lock ./
COPY tsconfig.json ./
COPY nx.json ./

COPY apps/APIs/package.json ./apps/APIs/package.json
COPY packages/DB/package.json ./packages/DB/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/auth/package.json ./packages/auth/package.json

FROM workspace-manifests AS install-prod

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --ignore-scripts

FROM base AS source

COPY package.json ./
COPY bun.lock ./
COPY tsconfig.json ./
COPY nx.json ./

COPY apps/APIs ./apps/APIs
COPY packages/DB ./packages/DB
COPY packages/contracts ./packages/contracts
COPY packages/auth ./packages/auth

FROM base AS production

ARG NODE_ENV=production

ENV NODE_ENV=${NODE_ENV}
ENV PORT=8000

COPY --from=install-prod /app/node_modules ./node_modules
COPY --from=install-prod /app/apps/APIs/node_modules ./apps/APIs/node_modules
COPY --from=install-prod /app/packages/DB/node_modules ./packages/DB/node_modules
COPY --from=install-prod /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=install-prod /app/packages/auth/node_modules ./packages/auth/node_modules

COPY --from=source /app/apps/APIs ./apps/APIs
COPY --from=source /app/packages/DB ./packages/DB
COPY --from=source /app/packages/contracts ./packages/contracts
COPY --from=source /app/packages/auth ./packages/auth

WORKDIR /app/apps/APIs

EXPOSE 8000

CMD ["sh", "-c", "set -e; bun run db:push; bun run start"]
