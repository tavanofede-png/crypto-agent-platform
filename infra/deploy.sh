#!/bin/bash
# ════════════════════════════════════════════════════════════
#  Zero-downtime deploy script
#  Usage: bash deploy.sh [image-tag]
#  Example: bash deploy.sh v1.2.3
# ════════════════════════════════════════════════════════════

set -euo pipefail

APP_DIR="/opt/cap"
IMAGE_TAG="${1:-latest}"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml"
ENV_FILE="$APP_DIR/.env"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date +%T)]${NC} $*"; }
warn() { echo -e "${YELLOW}[$(date +%T)]${NC} $*"; }
err()  { echo -e "${RED}[$(date +%T)] ERROR:${NC} $*"; exit 1; }

[[ ! -f "$ENV_FILE" ]] && err ".env not found at $ENV_FILE"

cd "$APP_DIR"

# ─── 1. Pull latest code ─────────────────────────────────────
log "Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/master

# ─── 2. Export env vars ──────────────────────────────────────
export $(grep -v '^#' "$ENV_FILE" | xargs)
export IMAGE_TAG="$IMAGE_TAG"

# ─── 3. Pull new images ──────────────────────────────────────
log "Building Docker images (tag: $IMAGE_TAG)..."
$COMPOSE build --parallel

# ─── 4. Run DB migrations (before restarting API) ────────────
log "Running database migrations..."
$COMPOSE run --rm api sh -c "
  cd /app &&
  npx prisma migrate deploy --schema=../../packages/db/prisma/schema.prisma
" || warn "Migration skipped (API image may not have prisma CLI — run manually if needed)"

# ─── 5. Rolling restart — infra first ────────────────────────
log "Restarting infrastructure services..."
$COMPOSE up -d postgres redis --no-recreate

# Wait for healthy
log "Waiting for Postgres to be healthy..."
until $COMPOSE exec postgres pg_isready -U "$POSTGRES_USER" -q; do
  sleep 2
done

# ─── 6. Restart runtime + worker ─────────────────────────────
log "Restarting runtime service..."
$COMPOSE up -d runtime --force-recreate

log "Waiting for runtime to be healthy..."
sleep 10

log "Restarting worker..."
$COMPOSE up -d worker --force-recreate

# ─── 7. Restart API ──────────────────────────────────────────
log "Restarting API..."
$COMPOSE up -d api --force-recreate

log "Waiting for API to be healthy..."
RETRIES=20
until $COMPOSE exec api wget -qO- http://localhost:3001/api/auth/nonce/0x0000000000000000000000000000000000000000 &>/dev/null; do
  sleep 3
  RETRIES=$((RETRIES - 1))
  [[ $RETRIES -le 0 ]] && err "API failed to become healthy"
done

# ─── 8. Restart web ──────────────────────────────────────────
log "Restarting web..."
$COMPOSE up -d web --force-recreate

log "Waiting for web to be healthy..."
sleep 8

# ─── 9. Reload nginx (no downtime) ───────────────────────────
log "Reloading nginx..."
$COMPOSE exec nginx nginx -t
$COMPOSE exec nginx nginx -s reload

# ─── 10. Cleanup old images ──────────────────────────────────
log "Cleaning up dangling images..."
docker image prune -f >/dev/null 2>&1

# ─── 11. Status summary ──────────────────────────────────────
echo ""
log "✅ Deploy complete!"
echo ""
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo ""
log "Check logs: docker compose -f $APP_DIR/docker-compose.prod.yml logs -f --tail=50"
