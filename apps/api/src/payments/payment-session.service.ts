/**
 * PaymentSessionService
 *
 * Manages the lifecycle of a PaymentSession:
 *   PENDING → DETECTED → CONFIRMING → CONFIRMED | FAILED | EXPIRED
 *
 * Payment matching strategy (MVP — wallet address):
 *   When a user authenticates, their walletAddress is stored in the JWT and
 *   in the User record. When they initiate a payment, we create a session
 *   tied to that walletAddress. When the watcher sees an incoming transfer,
 *   it calls `matchTransferToSession()` which looks for a PENDING session
 *   where session.walletAddress == transfer.from. This is reliable because:
 *     1. The user is already authenticated with that specific wallet.
 *     2. MetaMask / Beexo always sends from the connected account.
 *   The only failure case is if the user sends from a different wallet —
 *   which the UI explicitly warns against.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';
import { CreatePaymentSessionDto } from './dto/create-session.dto';
import { PaymentPurpose, PaymentSessionStatus } from '@prisma/client';

const DEFAULT_AMOUNTS: Record<PaymentPurpose, string> = {
  AGENT_CREATION: '5.00',
  CREDIT_TOPUP: '10.00',
};

const CREDITS_AWARDED: Record<PaymentPurpose, (amount: string) => number> = {
  AGENT_CREATION: () => 500,
  CREDIT_TOPUP: (amount) => Math.floor(parseFloat(amount) * 100),
};

@Injectable()
export class PaymentSessionService {
  private readonly logger = new Logger(PaymentSessionService.name);
  private readonly sessionTtlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chainService: ChainService,
    private readonly config: ConfigService,
  ) {
    this.sessionTtlMinutes = this.config.get<number>('PAYMENT_SESSION_TTL_MINUTES', 15);
  }

  // ─── Session creation ──────────────────────────────────────

  async createSession(dto: CreatePaymentSessionDto, userId: string) {
    if (!this.chainService.isChainSupported(dto.chainId)) {
      throw new BadRequestException(`Chain ${dto.chainId} is not supported`);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Enforce one active session per user per chain (prevents spam)
    const existing = await this.prisma.paymentSession.findFirst({
      where: {
        userId,
        chainId: dto.chainId,
        purpose: dto.purpose,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) {
      // Return existing session with full details — same shape as a newly created one
      const chainCfg = this.chainService.getChainConfig(existing.chainId);
      return {
        ...this.formatSession(existing),
        treasuryAddress: this.chainService.getTreasuryAddress(),
        chainName: chainCfg.name,
      };
    }

    const chainCfg = this.chainService.getChainConfig(dto.chainId);
    const treasury = this.chainService.getTreasuryAddress();

    // Resolve token info
    let tokenSymbol: string;
    let tokenDecimals: number;
    let tokenAddress: string | null = null;

    if (dto.tokenAddress) {
      const tokenCfg = this.chainService.getTokenConfig(dto.chainId, dto.tokenAddress);
      if (!tokenCfg) {
        throw new BadRequestException(
          `Token ${dto.tokenAddress} is not supported on chain ${dto.chainId}`,
        );
      }
      tokenSymbol = tokenCfg.symbol;
      tokenDecimals = tokenCfg.decimals;
      tokenAddress = this.chainService.checksumAddress(dto.tokenAddress);
    } else {
      tokenSymbol = chainCfg.nativeSymbol;
      tokenDecimals = chainCfg.nativeDecimals;
    }

    const displayAmount = dto.amount ?? DEFAULT_AMOUNTS[dto.purpose];
    const expectedAmount = this.chainService
      .toSmallestUnit(displayAmount, tokenDecimals)
      .toString();

    const expiresAt = new Date(Date.now() + this.sessionTtlMinutes * 60_000);

    const session = await this.prisma.paymentSession.create({
      data: {
        userId,
        walletAddress: user.walletAddress,
        chainId: dto.chainId,
        tokenAddress,
        tokenSymbol,
        tokenDecimals,
        expectedAmount,
        displayAmount,
        purpose: dto.purpose,
        expiresAt,
      },
    });

    this.logger.log(
      `Session ${session.id} created for user ${userId}: ` +
        `${displayAmount} ${tokenSymbol} on chain ${dto.chainId}`,
    );

    return {
      ...this.formatSession(session),
      treasuryAddress: treasury,
      chainName: chainCfg.name,
    };
  }

  // ─── Session lookup ────────────────────────────────────────

  async getSession(id: string, userId: string) {
    const session = await this.prisma.paymentSession.findUnique({
      where: { id },
      include: { blockchainPayment: true },
    });

    if (!session) throw new NotFoundException('Payment session not found');
    if (session.userId !== userId) throw new NotFoundException('Payment session not found');

    const chainCfg = this.chainService.getChainConfig(session.chainId);
    const requiredConfs = chainCfg.requiredConfirmations;
    const currentConfs = session.blockchainPayment?.confirmations ?? 0;

    return {
      ...this.formatSession(session),
      treasuryAddress: this.chainService.getTreasuryAddress(),
      chainName: chainCfg.name,
      blockchainPayment: session.blockchainPayment
        ? {
            txHash: session.blockchainPayment.txHash,
            blockNumber: session.blockchainPayment.blockNumber,
            confirmations: currentConfs,
            requiredConfirmations: requiredConfs,
            confirmedAt: session.blockchainPayment.confirmedAt,
          }
        : null,
    };
  }

  async getUserSessions(userId: string) {
    const sessions = await this.prisma.paymentSession.findMany({
      where: { userId },
      include: { blockchainPayment: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return sessions.map((s) => this.formatSession(s));
  }

  // ─── Transfer matching (called by PaymentWatcherService) ───

  /**
   * Find the best matching PENDING session for an incoming transfer.
   *
   * Matching rules (in order of strictness):
   *  1. walletAddress == fromAddress (the user must send from their auth wallet)
   *  2. chainId matches
   *  3. tokenAddress matches (null == null for native)
   *  4. amountReceived >= expectedAmount (allow small overpayments)
   *  5. status == PENDING and not expired
   *
   * If multiple sessions match (unlikely), we take the oldest one first
   * (FIFO — first session created gets matched).
   */
  async matchTransferToSession(params: {
    chainId: number;
    fromAddress: string;
    tokenAddress: string | null;
    amountReceived: bigint;
  }) {
    const { chainId, fromAddress, tokenAddress, amountReceived } = params;

    const candidates = await this.prisma.paymentSession.findMany({
      where: {
        walletAddress: fromAddress.toLowerCase(),
        chainId,
        tokenAddress: tokenAddress?.toLowerCase() ?? null,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Amount check (bigint comparison — expected is stored as string)
    for (const session of candidates) {
      const expected = BigInt(session.expectedAmount);
      // Allow up to 1% underpayment as tolerance for gas/price fluctuations
      const tolerance = expected / 100n;
      if (amountReceived >= expected - tolerance) {
        return session;
      }
    }

    return null;
  }

  // ─── Status transitions (called by PaymentWatcherService / Processor) ──

  async markDetected(
    sessionId: string,
    txHash: string,
    blockNumber: number,
    chainId: number,
    fromAddress: string,
    toAddress: string,
    tokenAddress: string | null,
    amountReceived: bigint,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.paymentSession.update({
        where: { id: sessionId },
        data: { status: 'DETECTED' },
      });

      const payment = await tx.blockchainPayment.create({
        data: {
          sessionId,
          txHash,
          blockNumber,
          chainId,
          fromAddress: fromAddress.toLowerCase(),
          toAddress: toAddress.toLowerCase(),
          tokenAddress: tokenAddress?.toLowerCase() ?? null,
          amountReceived: amountReceived.toString(),
        },
      });

      this.logger.log(
        `Payment detected for session ${sessionId}: tx ${txHash} on chain ${chainId}`,
      );
      return payment;
    });
  }

  async updateConfirmations(paymentId: string, confirmations: number) {
    const payment = await this.prisma.blockchainPayment.update({
      where: { id: paymentId },
      data: { confirmations },
      include: { session: true },
    });

    if (payment.session.status === 'DETECTED' && confirmations > 0) {
      await this.prisma.paymentSession.update({
        where: { id: payment.sessionId },
        data: { status: 'CONFIRMING' },
      });
    }

    return payment;
  }

  async markConfirmed(sessionId: string, paymentId: string) {
    const session = await this.prisma.paymentSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.status === 'CONFIRMED') return; // idempotent

    const creditsToAward = CREDITS_AWARDED[session.purpose](session.displayAmount);

    await this.prisma.$transaction(async (tx) => {
      // 1. Confirm the payment record
      await tx.blockchainPayment.update({
        where: { id: paymentId },
        data: { confirmedAt: new Date() },
      });

      // 2. Mark session confirmed
      await tx.paymentSession.update({
        where: { id: sessionId },
        data: { status: 'CONFIRMED' },
      });

      // 3. Award credits
      const newBalance = session.user.credits + creditsToAward;
      await tx.user.update({
        where: { id: session.userId },
        data: { credits: { increment: creditsToAward } },
      });

      // 4. Append immutable ledger entry
      await tx.creditLedger.create({
        data: {
          userId: session.userId,
          delta: creditsToAward,
          balanceAfter: newBalance,
          reason: 'payment_confirmed',
          sessionId,
          metadata: {
            purpose: session.purpose,
            chainId: session.chainId,
            tokenSymbol: session.tokenSymbol,
            displayAmount: session.displayAmount,
          },
        },
      });
    });

    this.logger.log(
      `Session ${sessionId} confirmed — +${creditsToAward} credits to user ${session.userId}`,
    );
  }

  async expireStaleSessionsJob() {
    const result = await this.prisma.paymentSession.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.debug(`Expired ${result.count} stale payment sessions`);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────

  private formatSession(session: any) {
    return {
      id: session.id,
      userId: session.userId,
      walletAddress: session.walletAddress,
      chainId: session.chainId,
      tokenAddress: session.tokenAddress,
      tokenSymbol: session.tokenSymbol,
      tokenDecimals: session.tokenDecimals,
      expectedAmount: session.expectedAmount,
      displayAmount: session.displayAmount,
      purpose: session.purpose,
      status: session.status,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    };
  }
}
