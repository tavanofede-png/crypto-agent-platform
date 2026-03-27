import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly creditsPerDollar: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly chainService: ChainService,
  ) {
    this.creditsPerDollar = this.config.get<number>('CREDITS_PER_DOLLAR', 100);
  }

  getPaymentInfo() {
    const chains = this.chainService.getSupportedChains().map((c) => ({
      id: c.id,
      name: c.name,
      nativeSymbol: c.nativeSymbol,
      requiredConfirmations: c.requiredConfirmations,
      supportedTokens: c.supportedTokens,
    }));

    let treasury: string;
    try {
      treasury = this.chainService.getTreasuryAddress();
    } catch {
      treasury = '0x0000000000000000000000000000000000000000';
    }

    return {
      treasuryAddress: treasury,
      creditsPerDollar: this.creditsPerDollar,
      sessionTtlMinutes: this.config.get<number>('PAYMENT_SESSION_TTL_MINUTES', 15),
      supportedChains: chains,
    };
  }

  /** Mock payment — DEV only */
  async mockConfirm(walletAddress: string, amount: number, userId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Mock payments not available in production');
    }

    const creditsAwarded = Math.floor(amount * this.creditsPerDollar);
    const mockTxHash = `0xmock${Date.now().toString(16)}`;

    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: creditsAwarded } },
      }),
      this.prisma.transaction.create({
        data: {
          walletAddress: walletAddress.toLowerCase(),
          txHash: mockTxHash,
          amount,
          token: 'MOCK',
          chainId: 0,
          status: 'CONFIRMED',
          creditsAwarded,
        },
      }),
    ]);

    this.logger.log(`Mock payment: +${creditsAwarded} credits to ${userId}`);
    return { success: true, creditsAwarded, txHash: mockTxHash, newBalance: updatedUser.credits };
  }

  /** Legacy manual confirm */
  async confirmPayment(dto: { txHash: string; walletAddress: string }, userId: string) {
    const existing = await this.prisma.transaction.findUnique({
      where: { txHash: dto.txHash },
    });
    if (existing?.status === 'CONFIRMED') {
      throw new BadRequestException('Transaction already confirmed');
    }

    const creditsAwarded = Math.floor(this.config.get<number>('PAYMENT_MIN_AMOUNT', 5) * this.creditsPerDollar);

    await this.prisma.$transaction([
      this.prisma.transaction.upsert({
        where: { txHash: dto.txHash },
        create: {
          walletAddress: dto.walletAddress.toLowerCase(),
          txHash: dto.txHash,
          amount: 5,
          token: 'USDC',
          chainId: 1,
          status: 'CONFIRMED',
          creditsAwarded,
        },
        update: { status: 'CONFIRMED', creditsAwarded },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: creditsAwarded } },
      }),
    ]);

    return { success: true, creditsAwarded };
  }

  async getTransactions(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return [];
    return this.prisma.transaction.findMany({
      where: { walletAddress: user.walletAddress },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getHistory(userId: string) {
    const [ledger, sessions] = await Promise.all([
      this.prisma.creditLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.paymentSession.findMany({
        where: { userId },
        include: { blockchainPayment: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return { ledger, sessions };
  }
}
