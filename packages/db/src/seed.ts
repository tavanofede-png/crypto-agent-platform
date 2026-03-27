/**
 * Seed script for local development.
 *
 * Creates:
 *  • 1 demo user  (Hardhat/Anvil account #0)
 *  • 1 COMPLETED AgentCreationOrder with its CONFIRMED PaymentSession
 *  • 3 demo agents (research STOPPED, trading STOPPED, coding RUNNING)
 *
 * Run:  pnpm db:seed
 */

import 'dotenv/config';
import {
  PrismaClient,
  AgentFramework,
  AgentStatus,
  OrderStatus,
  PaymentSessionStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_WALLET = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const DEMO_WALLET_DISPLAY = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// ─── SKILL.md templates ───────────────────────────────────────────────────────

const SKILL_RESEARCH = `# Crypto Research Agent

## Identity
You are a sharp research assistant specialising in crypto markets, DeFi
protocols, and blockchain technology.

## Core Skills
- Deep-dive analysis of on-chain data and metrics
- Summarise whitepapers and technical documentation clearly
- Track news, governance announcements, and market sentiment

## Constraints
- Never provide financial or investment advice
- Always note the date-sensitivity of market data
`;

const SKILL_TRADING = `# Trading Analysis Assistant

## Identity
You are a disciplined trading assistant for crypto markets.
Your role is to analyse, NOT to execute trades.

## Core Skills
- Technical analysis: support/resistance, RSI, MACD, volume
- Risk/reward ratio calculation and position sizing

## Constraints
- NEVER place or suggest placing trades
- Always remind users to DYOR
`;

const SKILL_CODING = `# Smart Contract & dApp Developer

## Identity
You are an expert Solidity developer and full-stack Web3 engineer.

## Core Skills
- Solidity smart contract development (ERC-20, ERC-721, ERC-4626)
- EVM security best practices
- TypeScript / React / Next.js for dApp frontends
- viem and wagmi integration patterns

## Constraints
- Always audit your own code for the OWASP Smart Contract Top 10
- Prefer battle-tested patterns over clever tricks
`;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database...\n');

  // ── 1. Demo user ──────────────────────────────────────────────────────────
  const demoUser = await prisma.user.upsert({
    where: { walletAddress: DEMO_WALLET },
    update: {},
    create: {
      walletAddress: DEMO_WALLET,
      nonce: 'dev-fixed-nonce',
    },
  });
  console.log(`✅ Demo user:    ${demoUser.id}  (${DEMO_WALLET_DISPLAY})`);

  // ── 2. Coding agent (RUNNING — ready for chat immediately) ────────────────
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
      workspacePath: 'C:/tmp/cap-workspaces/seed-agent-coding',
      temperature: 0.2,
      maxTokens: 8192,
    },
  });
  await prisma.skill.upsert({
    where: { agentId: codingAgent.id },
    update: { content: SKILL_CODING },
    create: { agentId: codingAgent.id, content: SKILL_CODING, template: 'coding' },
  });
  await prisma.agentLog.createMany({
    skipDuplicates: true,
    data: [
      { agentId: codingAgent.id, level: 'INFO', message: 'Agent seeded — ready to accept messages' },
      { agentId: codingAgent.id, level: 'INFO', message: 'SKILL.md loaded: Smart Contract Dev' },
    ],
  });
  console.log(`✅ Coding agent: ${codingAgent.id}  (RUNNING — ready for chat)`);

  // ── 3. Completed order for the coding agent ───────────────────────────────
  const completedOrder = await prisma.agentCreationOrder.upsert({
    where: { id: 'seed-order-coding' },
    update: {},
    create: {
      id: 'seed-order-coding',
      userId: demoUser.id,
      status: OrderStatus.COMPLETED,
      agentName: 'Smart Contract Dev',
      agentDescr: 'Solidity, EVM security, dApp development',
      framework: AgentFramework.ZEROCLAW,
      model: 'gpt-4o',
      skillTemplate: 'coding',
      skillContent: SKILL_CODING,
      temperature: 0.2,
      maxTokens: 8192,
      priceAmount: '0.005',
      priceToken: 'ETH',
      priceChainId: 11155111,
      agentId: codingAgent.id,
      txHash: '0xseedtxhash0000000000000000000000000000000000000000000000000001',
    },
  });

  // Payment session linked to the order
  await prisma.paymentSession.upsert({
    where: { id: 'seed-payment-session-001' },
    update: {},
    create: {
      id: 'seed-payment-session-001',
      userId: demoUser.id,
      walletAddress: DEMO_WALLET,
      chainId: 11155111,
      tokenAddress: null,
      tokenSymbol: 'ETH',
      tokenDecimals: 18,
      expectedAmount: '5000000000000000',
      displayAmount: '0.005',
      status: PaymentSessionStatus.CONFIRMED,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      orderId: completedOrder.id,
    },
  });
  console.log(`✅ Order:        ${completedOrder.id}  (COMPLETED)`);

  // ── 4. Research agent (STOPPED) ───────────────────────────────────────────
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
  console.log(`✅ Research:     ${researchAgent.id}  (STOPPED)`);

  // ── 5. Trading agent (STOPPED) ────────────────────────────────────────────
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
  console.log(`✅ Trading:      ${tradingAgent.id}  (STOPPED)`);

  console.log('\n✅ Seed complete!');
  console.log(`\n   Demo wallet: ${DEMO_WALLET_DISPLAY}`);
  console.log(`   Sign in:     POST /api/auth/verify { walletAddress, signature: "0xmock..." }`);
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
