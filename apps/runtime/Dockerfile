FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.1.4 --activate

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/runtime/package.json ./apps/runtime/
RUN pnpm install --frozen-lockfile

COPY apps/runtime ./apps/runtime
COPY tsconfig.base.json ./

RUN pnpm --filter @repo/runtime build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/runtime/dist ./apps/runtime/dist
COPY --from=builder /app/apps/runtime/package.json ./apps/runtime/package.json

RUN mkdir -p /workspaces
VOLUME ["/workspaces"]

EXPOSE 3002
CMD ["node", "apps/runtime/dist/main"]
