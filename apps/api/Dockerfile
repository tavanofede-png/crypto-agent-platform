FROM node:20-alpine AS base
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

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

# Entrypoint runs `prisma migrate deploy` then starts the server
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["./entrypoint.sh"]
