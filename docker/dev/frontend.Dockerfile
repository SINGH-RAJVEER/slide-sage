FROM oven/bun:1.3.6 AS development
WORKDIR /app

ENV BUN_INSTALL_CACHE_DIR=/root/.bun/install/cache

ARG NODE_ENV=development

ENV NODE_ENV=${NODE_ENV}
ENV PORT=5173

COPY package.json ./
COPY bun.lock ./
COPY tsconfig.json ./
COPY turbo.json ./

COPY apps/Web/package.json ./apps/Web/package.json
COPY apps/APIs/package.json ./apps/APIs/package.json
COPY packages/DB/package.json ./packages/DB/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/auth/package.json ./packages/auth/package.json

RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --ignore-scripts

EXPOSE 5173

CMD ["sh", "-lc", "cd /app/apps/Web && bun run dev --host 0.0.0.0"]
