# Local Development Guide

Everything you need to run, test, and extend the Crypto Agent Platform on
your local machine — no production credentials required.

---

## Folder Tree

```
crypto-agent-platform/
├── apps/
│   ├── api/                       NestJS REST + WebSocket API (port 3001)
│   │   ├── src/
│   │   │   ├── agent-orders/      Create-agent flow: order + payment session
│   │   │   ├── agents/            Agent CRUD, BullMQ provisioning jobs
│   │   │   ├── auth/              Wallet auth (SIWE-style nonce + JWT)
│   │   │   ├── chain/             viem PublicClient factory + blockchain utils
│   │   │   ├── chat/              Socket.IO gateway + streaming chat
│   │   │   ├── payments/          Payment sessions, watcher, processor
│   │   │   ├── prisma/            PrismaService
│   │   │   └── app.module.ts
│   │   ├── entrypoint.sh          Runs prisma migrate deploy then starts server
│   │   └── Dockerfile
│   │
│   ├── web/                       Next.js 14 App Router (port 3000)
│   │   ├── src/
│   │   │   ├── app/               Pages: /, /connect, /agents, /agents/[id]
│   │   │   ├── components/        ChatInterface, CreateAgentModal, AgentCard …
│   │   │   ├── hooks/             useWallet, useChat
│   │   │   ├── lib/               api.ts (axios client), wagmi.ts, socket.ts
│   │   │   ├── providers/         AppProviders (WagmiProvider + QueryClientProvider)
│   │   │   └── store/             useStore (Zustand persist)
│   │   ├── next.config.js         output: standalone (required for Docker)
│   │   └── Dockerfile
│   │
│   ├── runtime/                   Express agent workspace service (port 3002)
│   │   ├── src/
│   │   │   ├── main.ts            REST endpoints: /agents/:id/start|message|status|restart
│   │   │   ├── workspace.service.ts  Creates SKILL.md + config.toml + memory.json
│   │   │   └── agent.service.ts   Streams responses from OpenAI / Anthropic
│   │   └── Dockerfile
│   │
│   └── worker/                    BullMQ worker (no HTTP port)
│       ├── src/
│       │   ├── main.ts            Connects to Redis, listens on "agents" queue
│       │   └── workers/
│       │       └── agent.processor.ts  Handles provision / delete / restart jobs
│       └── Dockerfile
│
├── packages/
│   ├── db/                        Shared Prisma schema + client
│   │   ├── prisma/
│   │   │   └── schema.prisma      Single source of truth for all models
│   │   └── src/
│   │       ├── index.ts           Re-exports PrismaClient + all types
│   │       └── seed.ts            Dev seed data
│   └── ui/                        Shared React component library
│       └── src/                   Button, Card, Badge, Input, Spinner, cn()
│
├── docs/
│   └── SKILL.md.example           Fully working SKILL.md template
│
├── scripts/
│   └── smoke-test.ts              Programmatic E2E happy-path test
│
├── docker-compose.yml             All services (postgres, redis, api, web, worker, runtime)
├── .env.local.example             ← copy this to .env for local dev
├── .env.example                   Full example with all production vars
├── DEVELOPMENT.md                 This file
└── turbo.json
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 | https://nodejs.org |
| pnpm | ≥ 9 | `npm install -g pnpm@9` |
| Docker Desktop | any | https://docker.com |

---

## Step-by-Step Local Setup

### 1 — Clone and install

```bash
git clone https://github.com/tavanofede-png/crypto-agent-platform.git
cd crypto-agent-platform
pnpm install
```

### 2 — Configure environment

```bash
# Copy the local dev template
cp .env.local.example .env

# Then open .env and fill in:
#   OPENAI_API_KEY=sk-...      (required for chat)
#   ANTHROPIC_API_KEY=sk-ant-  (optional — for Claude models)
#
# All other values already have safe local defaults.
# Leave ACTIVE_CHAINS empty to disable the blockchain watcher (mock-only mode).
```

### 3 — Start Postgres and Redis

```bash
# Start only the infrastructure containers (no app rebuild needed)
docker compose up postgres redis -d

# Verify they're healthy
docker compose ps
```

Expected output:
```
NAME           STATUS
cap_postgres   running (healthy)
cap_redis      running (healthy)
```

### 4 — Set up the database

```bash
# Generate the Prisma client from schema.prisma
pnpm db:generate

# Apply the schema to your local Postgres (creates all tables)
pnpm --filter @repo/db exec prisma migrate dev --name init

# Seed demo data (demo user + 3 agents + completed order)
pnpm db:seed
```

After seeding you will have:
- **Demo user** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- **3 agents**: Crypto Research Bot (STOPPED), Trading Assistant (STOPPED), Smart Contract Dev (RUNNING)
- **1 completed AgentCreationOrder** with a confirmed PaymentSession
- **Mock nonce**: `dev-fixed-nonce` (allows instant sign-in)

### 5 — Run all services in development mode

Open four terminals (or use a terminal multiplexer):

```bash
# Terminal 1 — API (NestJS)
pnpm --filter @repo/api dev
# → http://localhost:3001/api

# Terminal 2 — Web (Next.js)
pnpm --filter @repo/web dev
# → http://localhost:3000

# Terminal 3 — Runtime (Express)
pnpm --filter @repo/runtime dev
# → http://localhost:3002

# Terminal 4 — Worker (BullMQ)
pnpm --filter @repo/worker dev
```

Or run all four in parallel with Turborepo (output is merged):

```bash
pnpm dev
```

---

## Mock Payment Mode (Dev Only)

Blockchain payment detection requires a real RPC URL and treasury wallet.
For local development, use the **mock pay** endpoint instead:

```bash
# 1. Create an agent order (returns orderId + paymentSession)
curl -X POST http://localhost:3001/api/agent-orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt>" \
  -d '{
    "name": "Test Agent",
    "framework": "ZEROCLAW",
    "model": "gpt-4o",
    "skillTemplate": "research"
  }'

# 2. Instantly confirm payment (dev only)
curl -X POST http://localhost:3001/api/agent-orders/<orderId>/mock-pay \
  -H "Authorization: Bearer <your-jwt>"
# → { "success": true, "txHash": "0xmock..." }

# 3. Poll until provisioned
curl http://localhost:3001/api/agent-orders/<orderId> \
  -H "Authorization: Bearer <your-jwt>"
# → { "status": "COMPLETED", "agentId": "..." }
```

This endpoint returns **400** when `NODE_ENV=production`.

**In the UI:** the payment modal shows a **"Mock Pay"** button (dev mode) below
the treasury address. Click it to skip the real transaction.

---

## Prisma Cheatsheet

```bash
# After changing schema.prisma, regenerate the client
pnpm db:generate

# Apply schema changes as a new migration (dev only)
pnpm --filter @repo/db exec prisma migrate dev --name <description>

# Apply existing migrations to a fresh DB (production-style)
pnpm --filter @repo/db exec prisma migrate deploy

# Open the Prisma Studio GUI
pnpm --filter @repo/db exec prisma studio

# Re-seed (idempotent — uses upsert)
pnpm db:seed
```

---

## Programmatic Smoke Test

```bash
# Requires the API and Worker to be running (pnpm dev)
pnpm smoke-test
```

This script exercises every API endpoint in order and prints pass/fail for each:

```
🚀 Crypto Agent Platform — Local Smoke Test
   API: http://localhost:3001
   Wallet: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

  ✅ [1]  API is reachable
  ✅ [2]  GET /api/auth/nonce
  ✅ [3]  POST /api/auth/verify (mock signature)
  ✅ [4]  GET /api/auth/me          →  wallet = 0xf39Fd6e51a…
  ✅ [5]  POST /api/agent-orders    →  id=clxxx… status=AWAITING_PAYMENT
  ✅ [6]  GET /api/agent-orders/:id →  session=clyyy… expires=12:34:00
  ✅ [7]  POST …/mock-pay           →  txHash = 0xmock1a2b3c
  ⏳ Waiting for order to reach COMPLETED…
  ✅ [8]  Order completed           →  agentId = clzzz…
  ✅ [9]  GET /api/agents/:id       →  name="Smoke Test Agent" status=RUNNING
  ✅ [10] GET /api/agents/:id/logs  →  3 log entries
  ✅ [11] Runtime reachable         →  http://localhost:3002/health
```

---

## Manual End-to-End Happy Path

### Step 1 — Connect wallet

1. Open **http://localhost:3000/connect**
2. Enter your wallet address (e.g. `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`)
3. Click **Conectar** — you are redirected to **/agents**

> **Via curl (for API-only testing):**
> ```bash
> # Get a nonce
> curl http://localhost:3001/api/auth/nonce/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
>
> # Sign in with a mock signature
> curl -X POST http://localhost:3001/api/auth/verify \
>   -H "Content-Type: application/json" \
>   -d '{"walletAddress":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","signature":"0xmockdev"}'
> # Copy the accessToken from the response
> ```

### Step 2 — Create an agent order

1. Click **"New Agent"**
2. Fill in name, framework, model, and skill template
3. Click **"Continue to Payment"** — the payment modal appears immediately with:
   - Treasury address to send to
   - Exact amount required
   - Expiry timer
   - Your wallet address (for the "send from this wallet" reminder)

### Step 3 — Pay

**Mock pay (dev):** click **"Mock Pay"** in the modal — payment is instantly confirmed.

**Real payment (with Sepolia configured):** send the exact ETH amount from your connected
wallet to the treasury address shown. The backend watcher detects it automatically.

### Step 4 — Wait for provisioning

The modal polls every 4 seconds and transitions through:
```
AWAITING_PAYMENT → PAYMENT_DETECTED → PAYMENT_CONFIRMED → PROVISIONING → COMPLETED
```

On `COMPLETED`, you are automatically redirected to the agent chat page.

### Step 5 — Chat

1. Status dot turns **green (RUNNING)** once provisioned
2. Type a message — press Enter to send
3. See a streaming response from the LLM

### Step 6 — Edit SKILL.md

1. Click **Settings** on the agent card (or in the sub-header)
2. Go to the **SKILL.md** tab
3. Edit the prompt and click **Save** — changes take effect on the next message

---

## Local Smoke Test Checklist

### Infrastructure
- [ ] `docker compose ps` shows `cap_postgres` and `cap_redis` as **healthy**
- [ ] `psql $DATABASE_URL -c "\dt"` lists all tables (users, agents, payment_sessions, …)

### API
- [ ] `curl http://localhost:3001/api/auth/nonce/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` returns `{ "nonce": "..." }`
- [ ] `POST /api/auth/verify` with `signature: "0xmockdev"` returns `{ accessToken, user }`
- [ ] `GET /api/auth/me` with Bearer token returns `{ id, walletAddress, createdAt }`
- [ ] `POST /api/agent-orders` returns `{ id, status: "AWAITING_PAYMENT", paymentSession: { ... } }`
- [ ] `POST /api/agent-orders/:id/mock-pay` returns `{ success: true, txHash }`
- [ ] `GET /api/agent-orders/:id` eventually shows `status: "COMPLETED"` with `agentId`
- [ ] `GET /api/agents/:id` shows the created agent

### Runtime
- [ ] `curl http://localhost:3002/health` returns `{ "status": "ok" }`
- [ ] `POST /agents/:id/start` creates workspace files in `WORKSPACE_BASE`
- [ ] `ls $WORKSPACE_BASE/<agentId>/` shows `SKILL.md`, `config.toml`, `memory.json`

### Worker
- [ ] Worker terminal shows `✅ Worker ready, listening on queue: agents`
- [ ] After mock-pay, worker terminal shows `provision-from-order` job completed

### Frontend
- [ ] http://localhost:3000 redirects to `/connect`
- [ ] Entering wallet address and clicking Conectar works
- [ ] Agent dashboard shows agents from seed
- [ ] Create Agent modal shows payment details immediately (no 4-second blank)
- [ ] Mock Pay button completes provisioning and redirects to chat
- [ ] Chat page loads and socket status shows **Connected** (green dot)
- [ ] Sending a message produces a streaming response
- [ ] Reopening the agent page restores the previous chat session

---

## Useful Dev Commands

```bash
# View all DB tables interactively
pnpm --filter @repo/db exec prisma studio
# → opens http://localhost:5555

# Reset and re-seed DB from scratch
pnpm --filter @repo/db exec prisma migrate reset --force
pnpm db:seed

# Tail API logs
docker compose logs api -f

# Run type-check across entire monorepo
pnpm type-check

# Run the automated smoke test
pnpm smoke-test
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `CHAIN_*_RPC_URL is required` on API start | Blockchain watcher enabled without RPC | Set `ACTIVE_CHAINS=` (empty) in `.env` |
| `TREASURY_ADDRESS env var is not set` | Treasury not configured | Set `TREASURY_ADDRESS=0xAny` in `.env` |
| Agent stuck at `PROVISIONING` | Worker not running | Run `pnpm --filter @repo/worker dev` |
| Chat socket shows `Disconnected` | API WebSocket not accessible | Check CORS — `FRONTEND_URL` must match `http://localhost:3000` |
| `Invalid signature` on auth | Wrong signature format | Mock path accepts any signature starting with `0xmock` in `NODE_ENV=development` |
| Payment modal shows blank initially | Order created without session | Fixed — `createOrder` now returns `paymentSession` immediately |
| Runtime 404 for agent workspace | Runtime lost in-memory state | Click "Restart" on the agent — worker re-provisions the workspace |
