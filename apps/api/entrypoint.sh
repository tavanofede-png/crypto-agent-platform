#!/bin/sh
# Run pending migrations then start the API server.
# Using `migrate deploy` (not `migrate dev`) — safe for production, idempotent.
set -e

echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma

echo "[entrypoint] Starting API server..."
exec node apps/api/dist/main
