FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/db/package.json ./packages/db/
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile

COPY packages/db ./packages/db
COPY apps/worker ./apps/worker
COPY tsconfig.base.json ./

RUN pnpm --filter @repo/db generate
RUN pnpm --filter @repo/worker build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json

CMD ["node", "apps/worker/dist/main"]
