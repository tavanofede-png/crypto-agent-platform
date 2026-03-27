import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';
import { CreateOrderDto, SkillTemplateDto } from './dto/create-order.dto';
import { OrderStatus } from '@prisma/client';

const SKILL_TEMPLATES: Record<string, string> = {
  research: `# Research Agent\n\n## Identity\nYou are a sharp research assistant specializing in crypto markets, DeFi protocols, and blockchain technology.\n\n## Core Skills\n- Deep-dive analysis of on-chain data\n- Summarize whitepapers and technical documentation\n- Track news, announcements and sentiment\n\n## Constraints\n- Do not provide financial advice\n- Always note the date-sensitivity of data\n`,
  trading:  `# Trading Assistant\n\n## Identity\nYou are a disciplined trading assistant for crypto markets. Your job is to analyze, NOT to execute trades.\n\n## Core Skills\n- Technical analysis (support/resistance, RSI, MACD)\n- Risk/reward ratio calculation\n- Position sizing recommendations\n\n## Constraints\n- NEVER place trades directly\n- Always remind user to DYOR\n`,
  coding:   `# Coding Agent\n\n## Identity\nYou are an expert smart contract and full-stack blockchain developer.\n\n## Core Skills\n- Solidity / Vyper smart contract development\n- EVM security best practices\n- TypeScript, React, Next.js for dApps\n\n## Constraints\n- Always audit your own code for common vulnerabilities\n- Prefer battle-tested patterns over clever tricks\n`,
};

@Injectable()
export class AgentOrdersService {
  private readonly logger = new Logger(AgentOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly chainService: ChainService,
    @InjectQueue('agents') private readonly agentsQueue: Queue,
  ) {}

  // ─── Pricing config ────────────────────────────────────────

  private getPricingConfig() {
    // ConfigService.get<number>() only changes the TS type — env vars are always
    // strings at runtime.  parseInt/parseFloat ensures Prisma receives real numbers.
    const chainId  = parseInt(this.config.get<string>('AGENT_CREATION_CHAIN_ID', '11155111'), 10);
    const price    = this.config.get<string>('AGENT_CREATION_PRICE', '0.005');
    const symbol   = this.config.get<string>('AGENT_CREATION_TOKEN_SYMBOL', 'ETH');
    const decimals = parseInt(this.config.get<string>('AGENT_CREATION_TOKEN_DECIMALS', '18'), 10);
    const tokenAddr= this.config.get<string>('AGENT_CREATION_TOKEN_ADDRESS', '') || null;
    return { chainId, price, symbol, decimals, tokenAddr };
  }

  // ─── Create order ──────────────────────────────────────────

  async createOrder(dto: CreateOrderDto, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const { chainId, price, symbol, decimals, tokenAddr } = this.getPricingConfig();

    // Resolve skill content
    const skillContent =
      dto.skillTemplate === SkillTemplateDto.CUSTOM && dto.customSkill
        ? dto.customSkill
        : SKILL_TEMPLATES[dto.skillTemplate] ?? SKILL_TEMPLATES.research;

    const ttlMinutes = parseInt(this.config.get<string>('PAYMENT_SESSION_TTL_MINUTES', '15'), 10);
    const expiresAt  = new Date(Date.now() + ttlMinutes * 60_000);

    // Compute expected amount in smallest unit
    const expectedAmount = this.chainService
      .toSmallestUnit(price, decimals)
      .toString();

    // Get treasury address (safe — placeholder is set in .env for dev)
    let treasury = '0x0000000000000000000000000000000000000001';
    try { treasury = this.chainService.getTreasuryAddress(); } catch { /* use placeholder */ }

    // Create order + payment session atomically
    const { order, session } = await this.prisma.$transaction(async (tx) => {
      const newOrder = await tx.agentCreationOrder.create({
        data: {
          userId,
          status: OrderStatus.AWAITING_PAYMENT,
          agentName:     dto.name,
          agentDescr:    dto.description,
          framework:     dto.framework as any,
          model:         dto.model,
          skillTemplate: dto.skillTemplate,
          skillContent,
          temperature:   dto.temperature ?? 0.7,
          maxTokens:     dto.maxTokens ?? 2048,
          priceAmount:   price,
          priceToken:    symbol,
          priceChainId:  chainId,
        },
      });

      const newSession = await tx.paymentSession.create({
        data: {
          userId,
          walletAddress:  user.walletAddress,
          chainId,
          tokenAddress:   tokenAddr,
          tokenSymbol:    symbol,
          tokenDecimals:  decimals,
          expectedAmount,
          displayAmount:  price,
          status:         'PENDING',
          expiresAt,
          orderId:        newOrder.id,
        },
      });

      return { order: newOrder, session: newSession };
    });

    this.logger.log(`Order ${order.id} created for user ${userId}`);

    // Auto-confirm and provision immediately (free agent creation).
    await this.prisma.$transaction([
      this.prisma.agentCreationOrder.update({
        where: { id: order.id },
        data:  { status: OrderStatus.PAYMENT_CONFIRMED, txHash: 'free' },
      }),
      this.prisma.paymentSession.update({
        where: { id: session.id },
        data:  { status: 'CONFIRMED' },
      }),
    ]);

    await this.agentsQueue.add(
      'provision-from-order',
      { orderId: order.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 3000 } },
    );

    this.logger.log(`Order ${order.id} auto-confirmed — provisioning queued`);

    return {
      ...this.formatOrder({ ...order, status: OrderStatus.PAYMENT_CONFIRMED }, treasury),
      paymentSession: null,
    };
  }

  // ─── Get order ─────────────────────────────────────────────

  async getOrder(id: string, userId: string) {
    const order = await this.prisma.agentCreationOrder.findUnique({
      where: { id },
      include: {
        paymentSession: {
          include: { blockchainPayment: true },
        },
        agent: { select: { id: true, name: true, status: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Access denied');

    let treasury = '0x0000000000000000000000000000000000000001';
    try { treasury = this.chainService.getTreasuryAddress(); } catch { /* use placeholder */ }

    const { chainId } = this.getPricingConfig();
    let requiredConfs = 1;
    try {
      const cfg = this.chainService.getChainConfig(chainId);
      requiredConfs = cfg.requiredConfirmations;
    } catch { /* use default */ }

    return {
      ...this.formatOrder(order, treasury),
      agent: order.agent ?? null,
      paymentSession: order.paymentSession
        ? {
            id:            order.paymentSession.id,
            status:        order.paymentSession.status,
            walletAddress: order.paymentSession.walletAddress,
            chainId:       order.paymentSession.chainId,
            tokenAddress:  order.paymentSession.tokenAddress,
            tokenSymbol:   order.paymentSession.tokenSymbol,
            displayAmount: order.paymentSession.displayAmount,
            expiresAt:     order.paymentSession.expiresAt,
            treasuryAddress: treasury,
            blockchainPayment: order.paymentSession.blockchainPayment
              ? {
                  txHash:        order.paymentSession.blockchainPayment.txHash,
                  confirmations: order.paymentSession.blockchainPayment.confirmations,
                  requiredConfirmations: requiredConfs,
                  confirmedAt:   order.paymentSession.blockchainPayment.confirmedAt,
                }
              : null,
          }
        : null,
    };
  }

  async getUserOrders(userId: string) {
    const orders = await this.prisma.agentCreationOrder.findMany({
      where: { userId },
      include: { paymentSession: true, agent: { select: { id: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    let treasury = '0x0000000000000000000000000000000000000001';
    try { treasury = this.chainService.getTreasuryAddress(); } catch { /* use placeholder */ }

    return orders.map((o) => this.formatOrder(o, treasury));
  }

  // ─── Payment confirmed hook (called by PaymentSessionService) ─

  async onPaymentConfirmed(orderId: string, txHash: string) {
    const order = await this.prisma.agentCreationOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) return;
    if (order.status !== OrderStatus.AWAITING_PAYMENT && order.status !== OrderStatus.PAYMENT_DETECTED) return;

    await this.prisma.agentCreationOrder.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAYMENT_CONFIRMED, txHash },
    });

    // Enqueue provisioning job
    await this.agentsQueue.add(
      'provision-from-order',
      { orderId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    this.logger.log(`Order ${orderId} payment confirmed — provision job queued`);
  }

  // Called by watcher when a transfer is first detected (before enough confirmations)
  async onPaymentDetected(orderId: string) {
    await this.prisma.agentCreationOrder.updateMany({
      where: { id: orderId, status: OrderStatus.AWAITING_PAYMENT },
      data:  { status: OrderStatus.PAYMENT_DETECTED },
    });
  }

  // ─── Mock pay (dev only) ───────────────────────────────────

  async mockPay(orderId: string, userId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Mock payments not available in production');
    }

    const order = await this.prisma.agentCreationOrder.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Access denied');

    const mockTxHash = `0xmock${Date.now().toString(16)}`;

    // Update session to CONFIRMED and order to PAYMENT_CONFIRMED
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentSession.updateMany({
        where: { orderId, status: 'PENDING' },
        data:  { status: 'CONFIRMED' },
      });
      await tx.agentCreationOrder.update({
        where: { id: orderId },
        data:  { status: OrderStatus.PAYMENT_CONFIRMED, txHash: mockTxHash },
      });
    });

    // Enqueue provisioning
    await this.agentsQueue.add(
      'provision-from-order',
      { orderId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    this.logger.log(`Mock payment for order ${orderId} — provision queued`);
    return { success: true, txHash: mockTxHash };
  }

  // ─── Format helper ─────────────────────────────────────────

  private formatOrder(order: any, treasuryAddress: string) {
    return {
      id:           order.id,
      status:       order.status,
      agentName:    order.agentName,
      agentDescr:   order.agentDescr,
      priceAmount:  order.priceAmount,
      priceToken:   order.priceToken,
      priceChainId: order.priceChainId,
      agentId:      order.agentId,
      txHash:       order.txHash,
      failedReason: order.failedReason,
      createdAt:    order.createdAt,
      treasuryAddress,
    };
  }
}
