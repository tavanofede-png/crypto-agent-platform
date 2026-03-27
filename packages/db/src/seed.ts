/**
 * Seed script for local development.
 *
 * Creates:
 *  • 1 demo user  (wallet = Hardhat/Anvil account #0, nonce = "dev-nonce")
 *  • 1 CONFIRMED PaymentSession + BlockchainPayment + CreditLedger entry
 *  • 3 agents (research STOPPED, trading STOPPED, coding RUNNING)
 *  • 1 legacy Transaction record (for the mock-confirm flow)
 *
 * Run:
 *   pnpm db:seed
 */

import 'dotenv/config';
import {
  PrismaClient,
  AgentFramework,
  AgentStatus,
  PaymentPurpose,
  PaymentSessionStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

// ─── Well-known addresses ──────────────────────────────────────────────────
// Hardhat / Anvil account #0 — the wallet used by the smoke test script.
const DEMO_WALLET = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const DEMO_WALLET_DISPLAY = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// ─── SKILL.md content ─────────────────────────────────────────────────────

const SKILL_RESEARCH = `# Crypto Research Agent

## Identity
You are a sharp research assistant specialising in crypto markets, DeFi
protocols, and blockchain technology. You have deep knowledge of on-chain
mechanics, tokenomics, and protocol design.

## Core Skills
- Deep-dive analysis of on-chain data and metrics
- Summarise whitepapers and technical documentation clearly
- Track news, governance announcements, and market sentiment
- Cross-reference multiple sources before reaching a conclusion

## Response Format
- Lead with a concise executive summary (2-3 sentences)
- Use bullet points for facts, data, and comparisons
- Cite sources or indicate when data is approximate
- Flag uncertainty or time-sensitivity explicitly

## Constraints
- Never provide financial or investment advice
- Always note the date-sensitivity of market data
- Prefer verifiable on-chain facts over speculation
`;

const SKILL_TRADING = `# Trading Analysis Assistant

## Identity
You are a disciplined trading assistant for crypto markets.
Your role is to analyse, NOT to execute trades.

## Core Skills
- Technical analysis: support/resistance, trend lines, RSI, MACD, volume
- Risk/reward ratio calculation and position sizing
- Market structure identification (higher highs, lower lows)
- Liquidation map awareness for leveraged markets

## Response Format
- Open with current market context (trend, key level)
- Provide clear entry zone, take-profit targets, and stop-loss
- State the risk percentage per trade explicitly
- Summarise trade thesis in one sentence

## Constraints
- NEVER place or suggest placing trades on behalf of the user
- Always remind users to Do Your Own Research (DYOR)
- Clearly separate technical analysis from personal opinion
`;

const SKILL_CODING = `# Smart Contract & dApp Developer

## Identity
You are an expert Solidity developer and full-stack Web3 engineer.
You write production-quality code with security as the first priority.

## Core Skills
- Solidity smart contract development (ERC-20, ERC-721, ERC-4626, custom)
- EVM security: reentrancy, overflow, access control, oracle manipulation
- TypeScript / React / Next.js for dApp frontends
- viem, wagmi, ethers.js integration patterns
- Foundry / Hardhat testing frameworks
- Gas optimisation techniques

## Response Format
- Provide complete, runnable code with no pseudo-code
- Add inline comments for non-obvious logic
- Include a test snippet for every contract function
- Proactively suggest security improvements

## Constraints
- Always audit your own code for the OWASP Smart Contract Top 10
- Prefer battle-tested patterns (OpenZeppelin) over clever tricks
- Mark unaudited code explicitly with a WARNING comment
`;

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database...\n');

  // ── 1. Demo user ──────────────────────────────────────────────────────────
  const demoUser = await prisma.user.upsert({
    where: { walletAddress: DEMO_WALLET },
    update: { credits: 500 },
    create: {
      walletAddress: DEMO_WALLET,
      // Fixed nonce makes it trivial to sign in the smoke test
      nonce: 'dev-fixed-nonce',
      credits: 500,
    },
  });
  console.log(`✅ Demo user:      ${demoUser.id}  (${DEMO_WALLET_DISPLAY})`);

  // ── 2. Confirmed payment session ──────────────────────────────────────────
  // This represents a successfully completed credit top-up via mock flow.
  const paymentSession = await prisma.paymentSession.upsert({
    where: { id: 'seed-payment-session-001' },
    update: {},
    create: {
      id: 'seed-payment-session-001',
      userId: demoUser.id,
      walletAddress: DEMO_WALLET,
      chainId: 11155111,             // Sepolia
      tokenAddress: null,            // native ETH
      tokenSymbol: 'ETH',
      tokenDecimals: 18,
      expectedAmount: '5000000000000000', // 0.005 ETH
      displayAmount: '0.005',
      purpose: PaymentPurpose.CREDIT_TOPUP,
      status: PaymentSessionStatus.CONFIRMED,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // +1h (already confirmed)
    },
  });

  // On-chain payment record for the session above
  await prisma.blockchainPayment.upsert({
    where: { txHash: '0xseedtxhash0000000000000000000000000000000000000000000000000001' },
    update: {},
    create: {
      sessionId: paymentSession.id,
      txHash: '0xseedtxhash0000000000000000000000000000000000000000000000000001',
      blockNumber: 6_000_000,
      chainId: 11155111,
      fromAddress: DEMO_WALLET,
      toAddress: '0x000000000000000000000000000000000000dead', // dummy treasury
      tokenAddress: null,
      amountReceived: '5000000000000000',
      confirmations: 5,
      confirmedAt: new Date(),
    },
  });

  // Immutable credit ledger entry for the topup
  await prisma.creditLedger.upsert({
    where: { id: 'seed-credit-ledger-001' },
    update: {},
    create: {
      id: 'seed-credit-ledger-001',
      userId: demoUser.id,
      delta: 500,
      balanceAfter: 500,
      reason: 'payment_confirmed',
      sessionId: paymentSession.id,
      metadata: {
        purpose: 'CREDIT_TOPUP',
        chainId: 11155111,
        tokenSymbol: 'ETH',
        displayAmount: '0.005',
      },
    },
  });
  console.log(`✅ Payment session: ${paymentSession.id}  (CONFIRMED, 500 credits)`);

  // ── 3. Legacy transaction (for mock-confirm compatibility) ─────────────────
  await prisma.transaction.upsert({
    where: { txHash: '0xmocktxhashseeddata000000000000000000000000000000000000000001' },
    update: {},
    create: {
      walletAddress: DEMO_WALLET,
      txHash: '0xmocktxhashseeddata000000000000000000000000000000000000000001',
      amount: 5.0,
      token: 'MOCK',
      chainId: 0,
      status: 'CONFIRMED',
      creditsAwarded: 500,
    },
  });

  // ── 4. Agents ──────────────────────────────────────────────────────────────

  // Research agent — STOPPED (needs provisioning)
  const researchAgent = await prisma.agent.upsert({
    where: { id: 'seed-agent-research' },
    update: {},
    create: {
      id: 'seed-agent-research',
      userId: demoUser.id,
      name: 'Crypto Research Bot',
      description: 'Deep research on crypto markets and DeFi protocols',
      framework: AgentFramework.ZEROCLAW,
      model: 'gpt-4o',
      status: AgentStatus.STOPPED,
      temperature: 0.3,
      maxTokens: 4096,
    },
  });
  await prisma.skill.upsert({
    where: { agentId: researchAgent.id },
    update: { content: SKILL_RESEARCH },
    create: { agentId: researchAgent.id, content: SKILL_RESEARCH, template: 'research' },
  });
  console.log(`✅ Research agent: ${researchAgent.id}  (STOPPED)`);

  // Trading agent — STOPPED
  const tradingAgent = await prisma.agent.upsert({
    where: { id: 'seed-agent-trading' },
    update: {},
    create: {
      id: 'seed-agent-trading',
      userId: demoUser.id,
      name: 'Trading Assistant',
      description: 'Technical analysis and trade setup guidance',
      framework: AgentFramework.OPENCLAW,
      model: 'claude-3-5-sonnet-20241022',
      status: AgentStatus.STOPPED,
      temperature: 0.5,
      maxTokens: 2048,
    },
  });
  await prisma.skill.upsert({
    where: { agentId: tradingAgent.id },
    update: { content: SKILL_TRADING },
    create: { agentId: tradingAgent.id, content: SKILL_TRADING, template: 'trading' },
  });
  console.log(`✅ Trading agent:  ${tradingAgent.id}  (STOPPED)`);

  // Coding agent — RUNNING (can be chatted with immediately if runtime is up)
  const codingAgent = await prisma.agent.upsert({
    where: { id: 'seed-agent-coding' },
    update: {},
    create: {
      id: 'seed-agent-coding',
      userId: demoUser.id,
      name: 'Smart Contract Dev',
      description: 'Solidity, EVM security, dApp development',
      framework: AgentFramework.ZEROCLAW,
      model: 'gpt-4o',
      status: AgentStatus.RUNNING,
      workspacePath: '/tmp/cap-workspaces/seed-agent-coding',
      temperature: 0.2,
      maxTokens: 8192,
    },
  });
  await prisma.skill.upsert({
    where: { agentId: codingAgent.id },
    update: { content: SKILL_CODING },
    create: { agentId: codingAgent.id, content: SKILL_CODING, template: 'coding' },
  });

  // Seed log entries so the logs tab has something to show
  await prisma.agentLog.createMany({
    skipDuplicates: true,
    data: [
      { agentId: codingAgent.id, level: 'INFO', message: 'Agent seeded by dev seed script' },
      { agentId: codingAgent.id, level: 'INFO', message: 'SKILL.md loaded — Smart Contract Dev template' },
      { agentId: codingAgent.id, level: 'INFO', message: 'Ready to accept messages' },
    ],
  });
  console.log(`✅ Coding agent:   ${codingAgent.id}  (RUNNING — ready for chat)`);

  console.log('\n✅ Seed complete!');
  console.log(`\n   Demo wallet:  ${DEMO_WALLET_DISPLAY}`);
  console.log(`   Credits:      ${demoUser.credits} (+ 500 via seeded payment)`);
  console.log(`   Mock sign-in: POST /api/auth/verify { walletAddress, signature: "0xmock..." }`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
