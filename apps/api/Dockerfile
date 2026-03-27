FROM node:20-alpine AS base
# Prisma engines need OpenSSL on Alpine (otherwise migrate deploy crashes with
# "Error load..." / invalid JSON from the schema engine).
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate

# ─── Build stage ─────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db
COPY apps/api ./apps/api
COPY tsconfig.base.json ./

RUN pnpm --filter @repo/db generate
RUN pnpm --filter @repo/api build

# ─── Production stage ────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Workspace root (needed for `pnpm --filter @repo/db exec prisma` in entrypoint)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
# pnpm keeps per-package symlinks — without these, Node cannot resolve
# reflect-metadata / @nestjs from apps/api/dist/main.js.
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules

# Entrypoint runs `prisma migrate deploy` then starts the server
COPY apps/api/entrypoint.sh ./entrypoint.sh
# Strip Windows CRLF so the script runs on Linux (Railway/Docker).
RUN sed -i 's/\r$//' ./entrypoint.sh && chmod +x ./entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]
