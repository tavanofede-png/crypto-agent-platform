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
│   │   │   ├── components/        UI: ChatInterface, CreateAgentModal, PaymentSessionModal …
│   │   │   ├── hooks/             useWallet, useChat, usePaymentSession
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

# Seed demo data (user, agents, payment session, credit ledger)
pnpm db:seed
```

After seeding you will have:
- **Demo user** `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` with **500 credits**
- **3 agents**: Crypto Research Bot (STOPPED), Trading Assistant (STOPPED), Smart Contract Dev (RUNNING)
- **1 confirmed payment session** + credit ledger entry
- **Mock nonce**: `dev-fixed-nonce` (allows instant sign-in without a real wallet)

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

## Mock Payment Mode

The mock payment endpoint bypasses all blockchain interaction and
instantly adds credits to the authenticated user.

**API call:**
```bash
curl -X POST http://localhost:3001/api/payments/mock-confirm \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt>" \
  -d '{ "amount": 10 }'
# → { "creditsAwarded": 1000, "newBalance": 1500 }
```

`amount` is in USD; credits are awarded at `CREDITS_PER_DOLLAR` (default 100).
This endpoint returns **400** when `NODE_ENV=production`.

**In the UI:** on the `/agents` page a **"Add 1000 Credits"** button appears
in development mode (top-right area). Click it to top-up without a wallet.

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
  ✅ [4]  POST /api/payments/mock-confirm  →  +1000 credits → balance 1500
  ✅ [5]  GET /api/auth/me                →  credits = 1500
  ✅ [6]  GET /api/payments/history       →  2 ledger entries, 1 sessions
  ✅ [7]  POST /api/payments/session      →  id = clxxx…, status = PENDING
  ✅ [8]  GET /api/payments/session/:id   →  status = PENDING
  ✅ [9]  POST /api/agents                →  id = clyyy…, status = PROVISIONING
  ⏳ Waiting for agent to provision…
  ✅ [10] Agent provisioned               →  status = RUNNING
  ✅ [11] GET /api/agents/:id/logs        →  3 log entries
  ✅ [12] Runtime workspace created       →  agent clyyy…
```

---

## Manual End-to-End Happy Path

This is the full user flow through the browser:

### Step 1 — Connect wallet

1. Open **http://localhost:3000/connect**
2. Click **MetaMask** (or any injected wallet)
3. Approve the connection in your wallet extension
4. A "Sign in to Crypto Agent Platform" message appears — approve it
5. You are redirected to **/agents**

> **No wallet?** Use the mock auth path:
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

### Step 2 — Add credits (mock payment)

1. On **/agents**, click the **"Add 1000 Credits"** button (dev mode, top right)
2. The page refreshes with **1000 credits** shown in the top navbar

### Step 3 — Create a payment session (real flow test)

1. Click **"New Agent"** → in the modal, if credits < 50 you see the "Buy Credits" banner
2. Click **"Buy Credits with Crypto"**
3. The `PaymentSessionModal` opens — it shows:
   - Treasury address (from `TREASURY_ADDRESS` env)
   - Expected amount
   - Expiry timer
4. Click **"Send from Wallet"** to send via MetaMask (Sepolia only for dev)
   — OR — use the mock confirm button to skip on-chain

### Step 4 — Create an agent

1. Click **"New Agent"** (with ≥ 50 credits)
2. Fill in:
   - **Name**: `My Research Bot`
   - **Framework**: `ZeroClaw`
   - **Model**: `GPT-4o`
   - **Skill Template**: `Research Agent`
3. Click **"Create Agent (50 credits)"**
4. The modal transitions to the spinning provisioning state
5. After ~3 seconds, you are redirected to **/agents** and see the agent card

### Step 5 — Open the agent chat

1. Click the agent card to open **/agents/[id]**
2. Status dot should turn **green (RUNNING)** within a few seconds
3. If still **amber (PROVISIONING)**, wait — the worker provisions in the background

### Step 6 — Send a message

1. Type in the chat input: **"What is Uniswap v3 concentrated liquidity?"**
2. Press Enter
3. You should see:
   - The message sent (right-aligned, violet bubble)
   - A typing indicator (three dots)
   - The streaming response (left-aligned, dark bubble, text appearing word-by-word)
4. After the response completes, the token count appears beneath the bubble

---

## Local Smoke Test Checklist

Use this checklist to verify a fresh local setup end-to-end:

### Infrastructure
- [ ] `docker compose ps` shows `cap_postgres` and `cap_redis` as **healthy**
- [ ] `psql $DATABASE_URL -c "\dt"` lists all tables (users, agents, payment_sessions, …)

### API
- [ ] `curl http://localhost:3001/api/auth/nonce/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` returns `{ "nonce": "..." }`
- [ ] `POST /api/auth/verify` with `signature: "0xmockdev"` returns `{ accessToken, user }`
- [ ] `GET /api/auth/me` with Bearer token returns user object with `credits`
- [ ] `POST /api/payments/mock-confirm { amount: 10 }` returns `{ creditsAwarded: 1000 }`
- [ ] `POST /api/agents` creates an agent and returns status `PROVISIONING`
- [ ] `GET /api/agents/:id` eventually shows status `RUNNING`
- [ ] `GET /api/agents/:id/logs` returns provisioning log entries

### Runtime
- [ ] `curl http://localhost:3002/health` returns `{ "status": "ok" }`
- [ ] `POST /agents/:id/start` creates workspace files in `WORKSPACE_BASE`
- [ ] `ls /tmp/cap-workspaces/<agentId>/` shows `SKILL.md`, `config.toml`, `memory.json`

### Worker
- [ ] Worker terminal shows `✅ Worker ready, listening on queue: agents`
- [ ] After creating an agent via API, worker terminal shows `provision` job completed

### Frontend
- [ ] http://localhost:3000 redirects to `/connect`
- [ ] Wallet connection flow completes (step indicator advances: Connect → Sign → Launch)
- [ ] Credits shown in navbar after mock payment
- [ ] Create Agent modal opens and shows credit check
- [ ] Agent card appears on dashboard after creation
- [ ] Chat page loads and socket status shows **Connected** (green dot)
- [ ] Sending a message produces a streaming response

### Payment session flow
- [ ] `POST /api/payments/session { purpose: "CREDIT_TOPUP", chainId: 11155111 }` returns `{ id, status: "PENDING", treasuryAddress, displayAmount }`
- [ ] `GET /api/payments/session/:id` returns session with correct fields
- [ ] `GET /api/payments/history` returns `{ ledger: [...], sessions: [...] }`
- [ ] Returning the same `POST /api/payments/session` request returns the **same session** (deduplication)

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
| `TREASURY_ADDRESS env var is not set` | Treasury not configured | Set `TREASURY_ADDRESS=0xAny` in `.env` (can be any address for dev) |
| Agent stuck at `PROVISIONING` | Worker not running | Run `pnpm --filter @repo/worker dev` |
| Chat socket shows `Disconnected` | API WebSocket not accessible | Check CORS — `FRONTEND_URL` must match `http://localhost:3000` |
| `Invalid signature` on auth | Wallet refused signing | The mock path uses `0xmock…` prefix — accepted in `NODE_ENV=development` |
| `Insufficient credits` error | Not enough credits | Click "Add 1000 Credits" (dev button) or run `pnpm smoke-test` |
| Runtime 404 for agent workspace | Runtime lost in-memory state | Click "Restart" on the agent — worker re-provisions the workspace |
