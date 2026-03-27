#!/bin/sh
# Run pending migrations then start the API server.
# Using `migrate deploy` (not `migrate dev`) — safe for production, idempotent.
set -e

echo "[entrypoint] Running database migrations..."
# Use workspace Prisma (5.x). Plain `npx prisma` can resolve to Prisma 7+ and break the schema.
pnpm --filter @repo/db exec prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma

echo "[entrypoint] Starting API server..."
exec node apps/api/dist/main
