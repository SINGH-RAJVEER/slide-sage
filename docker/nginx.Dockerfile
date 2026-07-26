# syntax=docker/dockerfile:1.7

ARG BUN_VERSION=1.3.10

FROM oven/bun:${BUN_VERSION}-alpine AS web-dependencies
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/APIs/package.json ./apps/APIs/package.json
COPY apps/Web/package.json ./apps/Web/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/types/package.json ./packages/types/package.json

RUN --mount=type=cache,id=slidesage-bun,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile \
        --filter slide-sage-web \
        --filter @slide-sage/types

FROM web-dependencies AS web-build
COPY tsconfig.json ./tsconfig.json
COPY apps/Web ./apps/Web
COPY packages/types/package.json ./packages/types/package.json
COPY packages/types/src ./packages/types/src

ARG VITE_API_URL=""
ENV NODE_ENV=production \
    VITE_API_URL=${VITE_API_URL}

WORKDIR /app/apps/Web
RUN bunx --bun vite build

FROM nginx:1.28-alpine AS nginx
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-build --chown=nginx:nginx /app/apps/Web/dist /usr/share/nginx/html

USER nginx
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/_nginx/health || exit 1
CMD ["nginx", "-g", "daemon off;"]
