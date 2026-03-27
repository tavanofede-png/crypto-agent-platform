# ════════════════════════════════════════════════════════════
#  Makefile — shortcuts for local dev and VPS operations
#  Usage: make <target>
# ════════════════════════════════════════════════════════════

APP_DIR   := /opt/cap
VPS_USER  := cap
COMPOSE_PROD := docker compose -f docker-compose.prod.yml

.PHONY: help dev up down logs db seed build deploy ssh

help:
	@echo ""
	@echo "  LOCAL DEV"
	@echo "  make dev         Start all services (docker infra + pnpm dev)"
	@echo "  make up          docker compose up -d (infra only)"
	@echo "  make down        docker compose down"
	@echo "  make logs        Tail all logs"
	@echo "  make db          Run migrations"
	@echo "  make seed        Seed database"
	@echo ""
	@echo "  PRODUCTION (run on VPS)"
	@echo "  make build       Build all Docker images"
	@echo "  make deploy      Zero-downtime deploy"
	@echo "  make ps          Show container status"
	@echo "  make logs-prod   Tail production logs"
	@echo "  make ssl         Re-issue SSL certificates"
	@echo ""

# ─── Local dev ───────────────────────────────────────────────
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

dev: up
	pnpm dev

db:
	pnpm db:migrate

seed:
	pnpm db:seed

# ─── Production ──────────────────────────────────────────────
build:
	$(COMPOSE_PROD) build --parallel

deploy:
	bash $(APP_DIR)/infra/deploy.sh

ps:
	$(COMPOSE_PROD) ps

logs-prod:
	$(COMPOSE_PROD) logs -f --tail=100

ssl:
	bash $(APP_DIR)/infra/ssl.sh

restart-api:
	$(COMPOSE_PROD) restart api

restart-worker:
	$(COMPOSE_PROD) restart worker

shell-api:
	$(COMPOSE_PROD) exec api sh

shell-db:
	$(COMPOSE_PROD) exec postgres psql -U $${POSTGRES_USER} $${POSTGRES_DB}
