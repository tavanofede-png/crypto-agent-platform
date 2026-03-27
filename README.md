# Crypto Agent Platform

A production-ready MVP for a crypto-powered AI agent platform, embeddable as a mini app inside Web3 wallets like **Beexo**.

## Architecture

```
crypto-agent-platform/
├── apps/
│   ├── web/        → Next.js 14 frontend (wagmi + Socket.IO)
│   ├── api/        → NestJS backend (REST + WebSockets)
│   ├── worker/     → BullMQ job processors
│   └── runtime/    → Express agent runtime (LLM streaming)
├── packages/
│   ├── db/         → Prisma schema + seed
│   └── ui/         → Shared React components
├── docker-compose.yml
└── turbo.json
```

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm install -g pnpm`)
- **Docker + Docker Compose** (for local infra)
- OpenAI or Anthropic API key

## Quick Start

### 1. Clone & Install

```bash
git clone <repo>
cd crypto-agent-platform
pnpm install
```

### 2. Environment

```bash
cp .env.example .env
# Edit .env — set OPENAI_API_KEY and/or ANTHROPIC_API_KEY
```

### 3. Start Infrastructure

```bash
pnpm docker:up
# Starts: postgres:5432 + redis:6379
```

### 4. Database Setup

```bash
pnpm db:migrate     # Run Prisma migrations
pnpm db:seed        # Seed demo user + 3 agents
```

### 5. Start Development

```bash
pnpm dev
```

This starts all services in parallel via Turborepo:

| Service | URL | Description |
|---------|-----|-------------|
| `web` | http://localhost:3000 | Next.js frontend |
| `api` | http://localhost:3001 | NestJS REST + WS |
| `runtime` | http://localhost:3002 | Agent runtime |
| `worker` | — | BullMQ background jobs |

---

## Feature Walkthrough

### 1. Wallet Connection
1. Visit http://localhost:3000
2. Click **Connect Wallet** → selects MetaMask / Beexo / Coinbase
3. Sign the nonce message in your wallet
4. JWT is issued and stored; you're authenticated

> **Dev mode**: If wallet signing fails, a mock signature is automatically used.

### 2. Credits & Payments
- Every agent creation costs **50 credits**
- In development, use the **Add 1000 Credits** button on the Agents page
- In production, users pay via USDC/USDT to the configured recipient address
- POST `/api/payments/confirm` with `txHash` to unlock credits

### 3. Creating an Agent
1. Click **New Agent**
2. Choose: name, framework (ZeroClaw/OpenClaw), model, skill template
3. Optionally write a custom SKILL.md
4. Submit → agent is created in DB → provisioning job is queued

### 4. Agent Runtime Flow
```
Worker picks up "provision" job
  └─> POST /agents/:id/start  (runtime)
       └─> Creates /workspaces/{agentId}/
            ├── SKILL.md      (agent identity & skills)
            ├── config.toml   (model, temperature, etc.)
            └── memory.json   (conversation history)
  └─> Agent status → RUNNING
```

### 5. Real-Time Chat
```
Frontend (Socket.IO) → API WebSocket Gateway → Runtime SSE stream
                                              ↓
Frontend ← message-chunk events ← API streams back chunks
```

### 6. Agent Dashboard
- `/agents` — list all agents with status
- `/agents/:id` — full-screen chat
- `/agents/:id/settings` — edit SKILL.md, view logs, danger zone

---

## API Reference

### Auth
```
GET  /api/auth/nonce/:address    → { nonce }
POST /api/auth/verify            → { accessToken, user }
GET  /api/auth/me                → user profile
```

### Agents
```
GET    /api/agents               → list agents
POST   /api/agents               → create agent
GET    /api/agents/:id           → get agent
PUT    /api/agents/:id           → update agent
DELETE /api/agents/:id           → delete agent
POST   /api/agents/:id/restart   → restart agent
GET    /api/agents/:id/logs      → agent logs
GET    /api/agents/:id/sessions  → chat sessions
```

### Payments
```
GET  /api/payments/info          → payment config
POST /api/payments/initiate      → start a payment
POST /api/payments/confirm       → confirm tx hash
POST /api/payments/mock-confirm  → dev-only mock
GET  /api/payments/transactions  → user transactions
```

### WebSocket Events (`/chat` namespace)
```
emit:
  join-agent     agentId
  new-session    agentId → { id, agentId }
  send-message   { agentId, sessionId, content }

on:
  message-start    { sessionId }
  message-chunk    { sessionId, chunk }
  message-complete { sessionId, content, tokensUsed }
  message-error    { sessionId, error }
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | Postgres connection | — |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `JWT_SECRET` | JWT signing secret | — |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `RUNTIME_URL` | Runtime service URL | `http://localhost:3002` |
| `WORKSPACE_BASE` | Agent workspace dir | `/tmp/workspaces` |
| `PAYMENT_RECIPIENT_ADDRESS` | Crypto payment address | — |
| `CREDITS_PER_DOLLAR` | Credits/USD ratio | `100` |
| `NEXT_PUBLIC_API_URL` | Frontend → API URL | `http://localhost:3001` |
| `NEXT_PUBLIC_WS_URL` | Frontend → WS URL | `http://localhost:3001` |

---

## Docker Production Deployment

```bash
# Build and run all services
docker-compose up --build -d

# Run migrations in API container
docker-compose exec api npx prisma migrate deploy

# Seed (optional)
docker-compose exec api node -e "require('./dist/prisma/seed')"
```

---

## Skill Templates

Three built-in templates are available:

| Template | Agent Identity |
|----------|---------------|
| `research` | Crypto market researcher |
| `trading` | Technical analysis assistant |
| `coding` | Smart contract & dApp developer |

Custom SKILL.md can be written in the Create Agent modal or edited post-creation via the Settings → SKILL.md tab.

---

## Security Notes

- Agent workspaces are isolated file system sandboxes
- `agentId` is validated as alphanumeric-only to prevent path traversal
- JWT required on all `/api/agents` and `/api/payments` routes
- Rate limiting via `@nestjs/throttler` (60 req/min default)
- Mock payments are **disabled in `NODE_ENV=production`**
- SKILL.md content is validated and size-limited (10k chars max)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, Tailwind CSS, wagmi v2, viem |
| State | Zustand + React Query |
| Real-time | Socket.IO |
| Backend | NestJS 10, Passport JWT |
| Queue | BullMQ (Redis) |
| Runtime | Express + OpenAI SDK + Anthropic SDK |
| Database | PostgreSQL via Prisma 5 |
| Infra | Docker Compose, Turborepo, pnpm workspaces |
