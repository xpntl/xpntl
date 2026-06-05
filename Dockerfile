FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp/package.json apps/mcp/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/storage/package.json packages/storage/package.json
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS build
COPY --from=deps /app ./
COPY tsconfig.base.json ./
COPY apps/mcp/ apps/mcp/
COPY packages/db/ packages/db/
COPY packages/domain/ packages/domain/
COPY packages/auth/ packages/auth/
COPY packages/storage/ packages/storage/
RUN pnpm --filter @xpntl/mcp run build

FROM base AS app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/apps/mcp/node_modules ./apps/mcp/node_modules
COPY --from=deps /app/packages/auth/node_modules ./packages/auth/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/domain/node_modules ./packages/domain/node_modules
COPY --from=deps /app/packages/storage/node_modules ./packages/storage/node_modules

COPY tsconfig.base.json ./
COPY apps/api/ apps/api/
COPY apps/mcp/package.json apps/mcp/package.json
COPY --from=build /app/apps/mcp/dist/ apps/mcp/dist/
COPY packages/auth/ packages/auth/
COPY packages/db/ packages/db/
COPY packages/domain/ packages/domain/
COPY packages/storage/ packages/storage/

EXPOSE 4000
ENV NODE_ENV=production
ENV PORT_API=4000

# Caches must be writable by the non-root user (tsx writes a transform cache,
# npx writes ~/.npm). Point them at world-writable locations.
ENV HOME=/home/node
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV XDG_CACHE_HOME=/tmp/.cache

# Drop root (XP-108 #8): run as the image's built-in unprivileged `node` user.
# The app only reads its world-readable source + node_modules and writes
# nothing to disk (blobs live in Azure), so read-only access is sufficient and
# it binds a non-privileged port (4000).
# NOTE: rebuild must be smoke-tested (`docker build . && docker run`) before
# deploy. Compiling the API + workspace packages to JS, installing prod-only
# deps, and dropping `npx`/`tsx` at runtime remain a tracked follow-up (the
# workspace packages are currently consumed as TS source).
USER node

CMD ["npx", "tsx", "apps/api/src/index.ts"]
