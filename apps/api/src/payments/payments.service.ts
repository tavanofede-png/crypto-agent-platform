import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chainService: ChainService,
  ) {}

  /** Returns supported chains, tokens, and treasury address for display in the UI. */
  getPaymentInfo() {
    const chains = this.chainService.getSupportedChains().map((c) => ({
      id:                    c.id,
      name:                  c.name,
      nativeSymbol:          c.nativeSymbol,
      requiredConfirmations: c.requiredConfirmations,
      supportedTokens:       c.supportedTokens,
    }));

    let treasury = '0x0000000000000000000000000000000000000000';
    try { treasury = this.chainService.getTreasuryAddress(); } catch { /* use placeholder */ }

    return { treasuryAddress: treasury, supportedChains: chains };
  }
}
