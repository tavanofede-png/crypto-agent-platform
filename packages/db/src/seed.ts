import 'dotenv/config';
import { PrismaClient, AgentFramework, AgentStatus } from '@prisma/client';

const prisma = new PrismaClient();

const SKILL_TEMPLATES = {
  research: `# Research Agent

## Identity
You are a sharp research assistant specializing in crypto markets, DeFi protocols, and blockchain technology.

## Core Skills
- Deep-dive analysis of on-chain data
- Summarize whitepapers and technical documentation
- Track news, announcements and sentiment
- Cross-reference multiple sources before concluding

## Response Format
- Lead with a concise summary (2-3 sentences)
- Use bullet points for facts and data
- Cite sources when possible
- Flag uncertainty clearly

## Constraints
- Do not provide financial advice
- Always note the date-sensitivity of data
- Prefer on-chain facts over speculation
`,

  trading: `# Trading Assistant

## Identity
You are a disciplined trading assistant for crypto markets. Your job is to analyze, NOT to execute trades.

## Core Skills
- Technical analysis (support/resistance, trend lines, RSI, MACD)
- Risk/reward ratio calculation
- Position sizing recommendations
- Market structure identification

## Response Format
- Always state current market context first
- Provide clear entry, target, and stop-loss levels
- Include risk percentage per trade
- Summarize thesis in one sentence

## Constraints
- NEVER place trades directly
- Always remind user to DYOR
- Clearly distinguish analysis from opinion
`,

  coding: `# Coding Agent

## Identity
You are an expert smart contract and full-stack blockchain developer.

## Core Skills
- Solidity / Vyper smart contract development
- EVM security best practices (reentrancy, overflow, access control)
- TypeScript, React, Next.js for dApps
- Ethers.js / viem / wagmi integration
- Gas optimization

## Response Format
- Provide complete, runnable code
- Include comments for non-obvious logic
- Suggest security improvements proactively
- Output test cases when writing contracts

## Constraints
- Always audit your own code for common vulnerabilities
- Prefer battle-tested patterns over clever tricks
- Flag unaudited code explicitly
`,
};

async function main() {
  console.log('🌱 Seeding database...');

  // Seed demo user
  const demoUser = await prisma.user.upsert({
    where: { walletAddress: '0xdemo000000000000000000000000000000000001' },
    update: {},
    create: {
      walletAddress: '0xdemo000000000000000000000000000000000001',
      credits: 500,
    },
  });
  console.log(`✅ Demo user created: ${demoUser.id}`);

  // Seed research agent
  const researchAgent = await prisma.agent.upsert({
    where: { id: 'seed-agent-research' },
    update: {},
    create: {
      id: 'seed-agent-research',
      userId: demoUser.id,
      name: 'Crypto Research Bot',
      description: 'Deep research on crypto markets and DeFi',
      framework: AgentFramework.ZEROCLAW,
      model: 'gpt-4o',
      status: AgentStatus.STOPPED,
      workspacePath: '/workspaces/seed-agent-research',
      temperature: 0.3,
      maxTokens: 4096,
    },
  });

  await prisma.skill.upsert({
    where: { agentId: researchAgent.id },
    update: {},
    create: {
      agentId: researchAgent.id,
      content: SKILL_TEMPLATES.research,
      template: 'research',
    },
  });
  console.log(`✅ Research agent seeded: ${researchAgent.id}`);

  // Seed trading agent
  const tradingAgent = await prisma.agent.upsert({
    where: { id: 'seed-agent-trading' },
    update: {},
    create: {
      id: 'seed-agent-trading',
      userId: demoUser.id,
      name: 'Trading Assistant',
      description: 'Technical analysis and trade setups',
      framework: AgentFramework.OPENCLAW,
      model: 'claude-3-5-sonnet-20241022',
      status: AgentStatus.STOPPED,
      workspacePath: '/workspaces/seed-agent-trading',
      temperature: 0.5,
      maxTokens: 2048,
    },
  });

  await prisma.skill.upsert({
    where: { agentId: tradingAgent.id },
    update: {},
    create: {
      agentId: tradingAgent.id,
      content: SKILL_TEMPLATES.trading,
      template: 'trading',
    },
  });
  console.log(`✅ Trading agent seeded: ${tradingAgent.id}`);

  // Seed coding agent
  const codingAgent = await prisma.agent.upsert({
    where: { id: 'seed-agent-coding' },
    update: {},
    create: {
      id: 'seed-agent-coding',
      userId: demoUser.id,
      name: 'Smart Contract Dev',
      description: 'Solidity development and dApp coding',
      framework: AgentFramework.ZEROCLAW,
      model: 'gpt-4o',
      status: AgentStatus.RUNNING,
      workspacePath: '/workspaces/seed-agent-coding',
      temperature: 0.2,
      maxTokens: 8192,
    },
  });

  await prisma.skill.upsert({
    where: { agentId: codingAgent.id },
    update: {},
    create: {
      agentId: codingAgent.id,
      content: SKILL_TEMPLATES.coding,
      template: 'coding',
    },
  });
  console.log(`✅ Coding agent seeded: ${codingAgent.id}`);

  // Seed demo transaction
  await prisma.transaction.upsert({
    where: { txHash: '0xdemo-tx-hash-seed' },
    update: {},
    create: {
      walletAddress: demoUser.walletAddress,
      txHash: '0xdemo-tx-hash-seed',
      amount: 10.0,
      token: 'USDC',
      chainId: 1,
      status: 'CONFIRMED',
      creditsAwarded: 1000,
    },
  });
  console.log(`✅ Demo transaction seeded`);

  console.log('✅ Seed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
