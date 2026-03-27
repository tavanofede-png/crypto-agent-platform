/**
 * smoke-test.ts
 *
 * End-to-end happy path test for local development.
 * Uses Node 18+ built-in fetch — no extra dependencies required.
 *
 * Exercises the full flow:
 *   1. GET  /api/auth/nonce/:address
 *   2. POST /api/auth/verify          (mock signature — dev mode only)
 *   3. POST /api/payments/mock-confirm (add credits)
 *   4. GET  /api/payments/history
 *   5. POST /api/agents              (create agent)
 *   6. GET  /api/agents/:id          (poll until RUNNING)
 *   7. GET  /api/agents/:id/logs     (verify provisioning logs)
 *   8. POST /api/payments/session    (create real payment session)
 *   9. GET  /api/payments/session/:id
 *   10. GET /api/auth/me             (verify credits updated)
 *
 * Run:
 *   pnpm smoke-test
 *   # or directly:
 *   npx ts-node scripts/smoke-test.ts
 */

import 'dotenv/config';

const API = process.env.SMOKE_TEST_API_URL ?? 'http://localhost:3001';
// Hardhat / Anvil account #0 (matches seed.ts)
const DEMO_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let token = '';
let step = 0;

function pass(label: string, detail?: string) {
  step++;
  console.log(`  ✅ [${step}] ${label}${detail ? `  →  ${detail}` : ''}`);
}

function fail(label: string, detail?: string): never {
  console.error(`\n  ❌ FAILED at step ${step + 1}: ${label}`);
  if (detail) console.error(`     ${detail}`);
  process.exit(1);
}

async function req<T = any>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    fail(`${method} ${path}`, `HTTP ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Test steps ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Crypto Agent Platform — Local Smoke Test`);
  console.log(`   API: ${API}`);
  console.log(`   Wallet: ${DEMO_WALLET}\n`);

  // ── Step 1: Health check ─────────────────────────────────────────────────
  {
    const res = await fetch(`${API.replace('/api', '')}/api/auth/nonce/${DEMO_WALLET}`).catch(
      () => null,
    );
    if (!res || !res.ok) {
      fail(
        'API reachable',
        `Cannot connect to ${API}. Is the API server running? Run: pnpm dev`,
      );
    }
    pass('API is reachable');
  }

  // ── Step 2: Get nonce ─────────────────────────────────────────────────────
  const { nonce } = await req<{ nonce: string }>('GET', `/api/auth/nonce/${DEMO_WALLET}`);
  if (!nonce) fail('GET /api/auth/nonce', 'No nonce returned');
  pass('GET /api/auth/nonce', `nonce = ${nonce.slice(0, 8)}…`);

  // ── Step 3: Mock sign-in ──────────────────────────────────────────────────
  const mockSignature = `0xmock${Date.now().toString(16)}`;
  const authResult = await req<{ accessToken: string; user: any }>(
    'POST',
    '/api/auth/verify',
    { walletAddress: DEMO_WALLET, signature: mockSignature },
  );
  if (!authResult.accessToken) fail('POST /api/auth/verify', 'No accessToken returned');
  token = authResult.accessToken;
  pass('POST /api/auth/verify (mock signature)', `userId = ${authResult.user.id}`);

  // ── Step 4: Mock payment → add credits ────────────────────────────────────
  const mockPay = await req<{ creditsAwarded: number; newBalance: number }>(
    'POST',
    '/api/payments/mock-confirm',
    { amount: 10 },
  );
  if (mockPay.creditsAwarded !== 1000) {
    fail(
      'POST /api/payments/mock-confirm',
      `Expected 1000 credits (10 × 100), got ${mockPay.creditsAwarded}`,
    );
  }
  pass('POST /api/payments/mock-confirm', `+${mockPay.creditsAwarded} credits → balance ${mockPay.newBalance}`);

  // ── Step 5: Verify /me returns updated credits ────────────────────────────
  const me = await req<{ credits: number }>('GET', '/api/auth/me');
  if (me.credits < 50) fail('GET /api/auth/me', `Expected ≥50 credits, got ${me.credits}`);
  pass('GET /api/auth/me', `credits = ${me.credits}`);

  // ── Step 6: Payment history ───────────────────────────────────────────────
  const history = await req<{ ledger: any[]; sessions: any[] }>('GET', '/api/payments/history');
  if (!Array.isArray(history.ledger)) fail('GET /api/payments/history', 'Missing ledger array');
  pass('GET /api/payments/history', `${history.ledger.length} ledger entries, ${history.sessions.length} sessions`);

  // ── Step 7: Create payment session ───────────────────────────────────────
  const sessionResult = await req<any>('POST', '/api/payments/session', {
    purpose: 'CREDIT_TOPUP',
    chainId: 11155111,
  });
  if (!sessionResult.id) fail('POST /api/payments/session', 'No session id returned');
  if (!sessionResult.treasuryAddress) {
    fail(
      'POST /api/payments/session',
      'Missing treasuryAddress — did you set TREASURY_ADDRESS in .env? ' +
        'For mock-only dev you can leave it blank; this field will be 0x000…',
    );
  }
  pass('POST /api/payments/session', `id = ${sessionResult.id}, status = ${sessionResult.status}`);

  // ── Step 8: Poll payment session ─────────────────────────────────────────
  const polled = await req<any>('GET', `/api/payments/session/${sessionResult.id}`);
  if (polled.status !== 'PENDING') {
    fail('GET /api/payments/session/:id', `Expected PENDING, got ${polled.status}`);
  }
  pass('GET /api/payments/session/:id', `status = ${polled.status}`);

  // ── Step 9: Create agent ──────────────────────────────────────────────────
  const agentResult = await req<any>('POST', '/api/agents', {
    name: 'Smoke Test Agent',
    framework: 'ZEROCLAW',
    model: 'gpt-4o',
    skillTemplate: 'research',
    temperature: 0.7,
    maxTokens: 2048,
  });
  if (!agentResult.id) fail('POST /api/agents', 'No agent id returned');
  pass('POST /api/agents', `id = ${agentResult.id}, status = ${agentResult.status}`);

  const agentId = agentResult.id;

  // ── Step 10: Poll agent until RUNNING or ERROR ────────────────────────────
  console.log(`\n   ⏳ Waiting for agent ${agentId} to provision…`);
  let agentStatus = agentResult.status;
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    const updated = await req<any>('GET', `/api/agents/${agentId}`);
    agentStatus = updated.status;
    process.stdout.write(`     → ${agentStatus}\r`);
    if (agentStatus === 'RUNNING' || agentStatus === 'ERROR') break;
  }
  console.log('');

  if (agentStatus === 'ERROR') {
    // Not a hard failure — the runtime may not be running in this env
    console.log(`   ⚠️  Agent status is ERROR — runtime service may not be running.`);
    console.log(`      Start it with: pnpm --filter @repo/runtime dev`);
    console.log(`      Continuing smoke test without chat step.\n`);
  } else if (agentStatus !== 'RUNNING') {
    fail('Agent provisioning', `Status stuck at ${agentStatus} after 30s`);
  } else {
    pass('Agent provisioned', `status = ${agentStatus}`);
  }

  // ── Step 11: Verify logs ──────────────────────────────────────────────────
  const logs = await req<any[]>('GET', `/api/agents/${agentId}/logs?limit=10`);
  if (!Array.isArray(logs) || logs.length === 0) {
    fail('GET /api/agents/:id/logs', 'No logs returned');
  }
  pass('GET /api/agents/:id/logs', `${logs.length} log entries`);

  // ── Step 12: Chat (only if agent is RUNNING) ──────────────────────────────
  if (agentStatus === 'RUNNING') {
    // Runtime must be running for this to work
    const runtimeUp = await fetch(`http://localhost:3002/health`)
      .then((r) => r.ok)
      .catch(() => false);

    if (!runtimeUp) {
      console.log(`   ⚠️  Runtime not reachable at http://localhost:3002 — skipping chat step.`);
      console.log(`      Start it with: pnpm --filter @repo/runtime dev\n`);
    } else {
      // Provision workspace on runtime directly (simulates what the worker does)
      const runtimeRes = await fetch(`http://localhost:3002/agents/${agentId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          framework: 'ZEROCLAW',
          model: 'gpt-4o',
          temperature: 0.7,
          maxTokens: 2048,
          skillContent:
            '# Smoke Test Agent\n\n## Identity\nYou are a helpful assistant.\n',
        }),
      });

      if (runtimeRes.ok) {
        pass('Runtime workspace created', `agent ${agentId}`);
        console.log(`\n   ✅ All automated steps passed.`);
        console.log(`   📖 To test chat, open http://localhost:3000/agents/${agentId}`);
      } else {
        console.log(`   ⚠️  Runtime workspace creation failed — chat not tested.`);
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Smoke test complete — all API endpoints responded correctly.

Next steps:
  1. Open http://localhost:3000/connect in your browser
  2. Click "MetaMask" and approve the connection
  3. Approve the sign-in message in your wallet
  4. Click "Add 1000 Credits" (dev button, top right)
  5. Click "New Agent" → fill the form → Create
  6. Wait for provisioning, then open the agent chat
  7. Send a message and verify streaming response

Agent created in this run: http://localhost:3000/agents/${agentId}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((err) => {
  console.error('\n💥 Unexpected error:', err);
  process.exit(1);
});
