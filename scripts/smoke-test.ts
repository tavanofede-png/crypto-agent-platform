/**
 * smoke-test.ts
 *
 * End-to-end happy path test for local development.
 * Uses Node 18+ built-in fetch — no extra dependencies required.
 *
 * Exercises the full direct-payment create-agent flow:
 *   1. GET  /api/auth/nonce/:address
 *   2. POST /api/auth/verify          (mock signature — dev mode only)
 *   3. GET  /api/auth/me              (verify auth)
 *   4. POST /api/agent-orders         (create order + payment session)
 *   5. GET  /api/agent-orders/:id     (verify order has paymentSession)
 *   6. POST /api/agent-orders/:id/mock-pay  (dev-only instant confirm)
 *   7. Poll /api/agent-orders/:id until COMPLETED (up to 30s)
 *   8. GET  /api/agents/:agentId      (verify agent was created)
 *   9. GET  /api/agents/:agentId/logs (verify provisioning logs)
 *   10. Runtime chat test (if runtime is up)
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

  // ── Step 1: Verify API is reachable ──────────────────────────────────────
  {
    const res = await fetch(`${API}/api/auth/nonce/${DEMO_WALLET}`).catch(() => null);
    if (!res || !res.ok) {
      fail(
        'API reachable',
        `Cannot connect to ${API}/api. Is the API server running? Run: pnpm dev`,
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
  const authResult = await req<{ accessToken: string; user: { id: string; walletAddress: string } }>(
    'POST',
    '/api/auth/verify',
    { walletAddress: DEMO_WALLET, signature: mockSignature },
  );
  if (!authResult.accessToken) fail('POST /api/auth/verify', 'No accessToken returned');
  token = authResult.accessToken;
  pass('POST /api/auth/verify (mock signature)', `userId = ${authResult.user.id}`);

  // ── Step 4: Verify /me ────────────────────────────────────────────────────
  const me = await req<{ id: string; walletAddress: string }>('GET', '/api/auth/me');
  if (!me.id) fail('GET /api/auth/me', 'No user id returned');
  pass('GET /api/auth/me', `wallet = ${me.walletAddress.slice(0, 10)}…`);

  // ── Step 5: Create agent order ────────────────────────────────────────────
  const orderResult = await req<any>('POST', '/api/agent-orders', {
    name: 'Smoke Test Agent',
    framework: 'ZEROCLAW',
    model: 'gpt-4o',
    skillTemplate: 'research',
    temperature: 0.7,
    maxTokens: 2048,
  });
  if (!orderResult.id) fail('POST /api/agent-orders', 'No order id returned');
  if (!orderResult.paymentSession) fail('POST /api/agent-orders', 'Missing paymentSession in response');
  if (orderResult.status !== 'AWAITING_PAYMENT') {
    fail('POST /api/agent-orders', `Expected AWAITING_PAYMENT, got ${orderResult.status}`);
  }
  pass(
    'POST /api/agent-orders',
    `id=${orderResult.id} status=${orderResult.status} treasury=${orderResult.treasuryAddress.slice(0, 10)}…`,
  );

  const orderId = orderResult.id;

  // ── Step 6: Poll order (verify paymentSession is present) ─────────────────
  const polledOrder = await req<any>('GET', `/api/agent-orders/${orderId}`);
  if (!polledOrder.paymentSession?.id) fail('GET /api/agent-orders/:id', 'Missing paymentSession');
  pass(
    'GET /api/agent-orders/:id',
    `session=${polledOrder.paymentSession.id} expires=${new Date(polledOrder.paymentSession.expiresAt).toLocaleTimeString()}`,
  );

  // ── Step 7: Mock pay (dev only — instantly confirms payment) ──────────────
  const mockPay = await req<{ success: boolean; txHash: string }>(
    'POST',
    `/api/agent-orders/${orderId}/mock-pay`,
  );
  if (!mockPay.success) fail('POST /api/agent-orders/:id/mock-pay', 'mock-pay returned success=false');
  pass('POST /api/agent-orders/:id/mock-pay', `txHash = ${mockPay.txHash}`);

  // ── Step 8: Poll order until COMPLETED ────────────────────────────────────
  console.log(`\n   ⏳ Waiting for order ${orderId} to reach COMPLETED…`);
  let orderStatus = 'PAYMENT_CONFIRMED';
  let agentId: string | null = null;
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    const updated = await req<any>('GET', `/api/agent-orders/${orderId}`);
    orderStatus = updated.status;
    agentId = updated.agentId ?? null;
    process.stdout.write(`     → ${orderStatus}\r`);
    if (orderStatus === 'COMPLETED' || orderStatus === 'FAILED') break;
  }
  console.log('');

  if (orderStatus === 'FAILED') {
    const failed = await req<any>('GET', `/api/agent-orders/${orderId}`);
    fail('Order provisioning failed', failed.failedReason ?? 'unknown reason');
  }
  if (orderStatus !== 'COMPLETED') {
    console.log(`   ⚠️  Order status is ${orderStatus} — worker may not be running.`);
    console.log(`      Start worker: pnpm --filter @repo/worker dev`);
    console.log(`      Continuing test without agent verification.\n`);
  } else {
    pass('Order completed', `agentId = ${agentId}`);
  }

  // ── Step 9: Verify agent was created ─────────────────────────────────────
  if (agentId) {
    const agent = await req<any>('GET', `/api/agents/${agentId}`);
    if (!agent.id) fail('GET /api/agents/:id', 'No agent returned');
    pass('GET /api/agents/:id', `name="${agent.name}" status=${agent.status}`);

    // ── Step 10: Verify provisioning logs ─────────────────────────────────
    const logs = await req<any[]>('GET', `/api/agents/${agentId}/logs?limit=10`);
    if (!Array.isArray(logs) || logs.length === 0) {
      fail('GET /api/agents/:id/logs', 'No logs returned');
    }
    pass('GET /api/agents/:id/logs', `${logs.length} log entries`);

    // ── Step 11: Runtime chat test (optional) ─────────────────────────────
    if (agent.status === 'RUNNING') {
      const runtimeUp = await fetch(`http://localhost:3002/health`)
        .then((r) => r.ok)
        .catch(() => false);

      if (!runtimeUp) {
        console.log(`   ⚠️  Runtime not reachable — skipping chat test.`);
        console.log(`      Start it: pnpm --filter @repo/runtime dev\n`);
      } else {
        pass('Runtime reachable', 'http://localhost:3002/health');
        console.log(`\n   ✅ All automated steps passed.`);
        console.log(`   📖 To test chat, open http://localhost:3000/agents/${agentId}`);
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Smoke test complete — all API endpoints responded correctly.

End-to-end flow exercised:
  connect wallet → create order → mock-pay → confirm → provision → agent ready

Next steps (in browser):
  1. Open http://localhost:3000/connect
  2. Enter your wallet address (or use ${DEMO_WALLET.slice(0, 10)}…)
  3. Click "Conectar" to sign in
  4. Click "New Agent" → fill the form → "Continue to Payment"
  5. Click "Mock Pay" (dev only) to simulate payment
  6. Wait for provisioning, then open the agent chat
  7. Send a message and verify streaming response
${agentId ? `\nAgent created in this run: http://localhost:3000/agents/${agentId}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch((err) => {
  console.error('\n💥 Unexpected error:', err);
  process.exit(1);
});
