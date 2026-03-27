import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface InitiatePaymentDto {
  walletAddress: string;
  amount: number;
  token: string;
  chainId: number;
}

export interface ConfirmPaymentDto {
  txHash: string;
  walletAddress: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly creditsPerDollar: number;
  private readonly recipientAddress: string;
  private readonly minAmount: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.creditsPerDollar = this.config.get<number>('CREDITS_PER_DOLLAR', 100);
    this.recipientAddress = this.config.get<string>(
      'PAYMENT_RECIPIENT_ADDRESS',
      '0x0000000000000000000000000000000000000000',
    );
    this.minAmount = this.config.get<number>('PAYMENT_MIN_AMOUNT', 5);
  }

  getPaymentInfo() {
    return {
      recipientAddress: this.recipientAddress,
      minAmount: this.minAmount,
      creditsPerDollar: this.creditsPerDollar,
      supportedTokens: ['USDC', 'USDT', 'DAI'],
      supportedChains: [
        { id: 1, name: 'Ethereum Mainnet' },
        { id: 137, name: 'Polygon' },
        { id: 42161, name: 'Arbitrum One' },
      ],
    };
  }

  async initiatePayment(dto: InitiatePaymentDto) {
    if (dto.amount < this.minAmount) {
      throw new BadRequestException(
        `Minimum payment amount is $${this.minAmount}`,
      );
    }

    const tx = await this.prisma.transaction.create({
      data: {
        walletAddress: dto.walletAddress.toLowerCase(),
        amount: dto.amount,
        token: dto.token,
        chainId: dto.chainId,
        status: 'PENDING',
        creditsAwarded: 0,
      },
    });

    return {
      transactionId: tx.id,
      recipientAddress: this.recipientAddress,
      amount: dto.amount,
      token: dto.token,
      chainId: dto.chainId,
    };
  }

  async confirmPayment(dto: ConfirmPaymentDto, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('User not found');

    const existing = await this.prisma.transaction.findUnique({
      where: { txHash: dto.txHash },
    });
    if (existing?.status === 'CONFIRMED') {
      throw new BadRequestException('Transaction already confirmed');
    }

    // MVP: In production, verify txHash on-chain using viem publicClient
    // For now, accept any tx hash and award credits based on amount
    const pendingTx = await this.prisma.transaction.findFirst({
      where: {
        walletAddress: dto.walletAddress.toLowerCase(),
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    const amount = pendingTx?.amount ?? this.minAmount;
    const creditsAwarded = Math.floor(amount * this.creditsPerDollar);

    const tx = await this.prisma.$transaction(async (prisma) => {
      const updatedTx = await prisma.transaction.upsert({
        where: { txHash: dto.txHash },
        create: {
          walletAddress: dto.walletAddress.toLowerCase(),
          txHash: dto.txHash,
          amount,
          token: pendingTx?.token ?? 'USDC',
          chainId: pendingTx?.chainId ?? 1,
          status: 'CONFIRMED',
          creditsAwarded,
        },
        update: {
          txHash: dto.txHash,
          status: 'CONFIRMED',
          creditsAwarded,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: creditsAwarded } },
      });

      return updatedTx;
    });

    this.logger.log(
      `Payment confirmed for ${dto.walletAddress}: +${creditsAwarded} credits`,
    );

    return {
      success: true,
      transactionId: tx.id,
      creditsAwarded,
      txHash: dto.txHash,
    };
  }

  async mockConfirm(walletAddress: string, amount: number, userId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('Mock payments not available in production');
    }

    const mockTxHash = `0xmock${Date.now().toString(16)}`;
    return this.confirmPayment({ txHash: mockTxHash, walletAddress }, userId);
  }

  async getTransactions(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return [];

    return this.prisma.transaction.findMany({
      where: { walletAddress: user.walletAddress },
      orderBy: { createdAt: 'desc' },
    });
  }
}
