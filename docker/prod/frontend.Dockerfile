FROM oven/bun:1.3.6 AS base
WORKDIR /app

ENV BUN_INSTALL_CACHE_DIR=/root/.bun/install/cache

FROM base AS workspace-manifests

COPY package.json ./
COPY bun.lock ./
COPY tsconfig.json ./
COPY nx.json ./

COPY apps/Web/package.json ./apps/Web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/auth/package.json ./packages/auth/package.json

FROM workspace-manifests AS install-dev

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

FROM workspace-manifests AS install-prod

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --ignore-scripts

FROM base AS source

COPY package.json ./
COPY bun.lock ./
COPY tsconfig.json ./
COPY nx.json ./

COPY apps/Web ./apps/Web
COPY packages/contracts ./packages/contracts
COPY packages/auth ./packages/auth

FROM base AS build

ARG NODE_ENV=production
ARG VITE_API_URL=

ENV NODE_ENV=${NODE_ENV}
ENV VITE_API_URL=${VITE_API_URL}

COPY --from=install-dev /app/node_modules ./node_modules
COPY --from=install-dev /app/apps/Web/node_modules ./apps/Web/node_modules
COPY --from=install-dev /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=install-dev /app/packages/auth/node_modules ./packages/auth/node_modules

COPY --from=source /app/apps/Web ./apps/Web
COPY --from=source /app/packages/contracts ./packages/contracts
COPY --from=source /app/packages/auth ./packages/auth

WORKDIR /app/apps/Web

RUN bun run build

FROM base AS production

ENV NODE_ENV=production
ENV PORT=5173

COPY --from=install-prod /app/node_modules ./node_modules
COPY --from=install-prod /app/apps/Web/node_modules ./apps/Web/node_modules
COPY --from=install-prod /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=install-prod /app/packages/auth/node_modules ./packages/auth/node_modules

COPY --from=build /app/apps/Web/dist ./dist
COPY --from=source /app/apps/Web/package.json ./package.json

EXPOSE 5173

CMD ["bun", "x", "serve", "dist", "-l", "5173"]
