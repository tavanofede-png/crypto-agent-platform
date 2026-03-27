/**
 * PaymentProcessorService
 *
 * Periodically checks DETECTED/CONFIRMING payments to see if they have
 * accumulated enough block confirmations.
 *
 * Runs on a 30-second interval via @nestjs/schedule @Interval.
 *
 * Confirmation flow:
 *  1. Query all BlockchainPayments whose session is in DETECTED | CONFIRMING
 *  2. For each: call getTransactionReceipt → compute confirmations
 *  3. Update BlockchainPayment.confirmations
 *  4. If confirmations >= chain.requiredConfirmations → markConfirmed()
 *
 * markConfirmed() (in PaymentSessionService):
 *  - Updates BlockchainPayment.confirmedAt
 *  - Updates PaymentSession.status = CONFIRMED
 *  - Calls AgentOrdersService.onPaymentConfirmed() → triggers agent provisioning
 */

import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';
import { PaymentSessionService } from './payment-session.service';

const CONFIRMATION_CHECK_INTERVAL_MS = 30_000; // 30 seconds

@Injectable()
export class PaymentProcessorService {
  private readonly logger = new Logger(PaymentProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chainService: ChainService,
    private readonly sessionService: PaymentSessionService,
  ) {}

  @Interval(CONFIRMATION_CHECK_INTERVAL_MS)
  async checkPendingConfirmations() {
    // Find all payments that are in a confirmable state
    const payments = await this.prisma.blockchainPayment.findMany({
      where: {
        session: {
          status: { in: ['DETECTED', 'CONFIRMING'] },
        },
        confirmedAt: null,
      },
      include: { session: true },
    });

    if (payments.length === 0) return;

    this.logger.debug(`Checking confirmations for ${payments.length} pending payment(s)`);

    for (const payment of payments) {
      await this.checkPayment(payment);
    }
  }

  private async checkPayment(payment: any) {
    const { chainId, txHash, id: paymentId, sessionId } = payment;

    try {
      const chainCfg = this.chainService.getChainConfig(chainId);
      const result = await this.chainService.getConfirmationCount(chainId, txHash as `0x${string}`);

      if (!result) {
        this.logger.warn(`tx ${txHash} not found on chain ${chainId} — may be pending`);
        return;
      }

      const { confirmations } = result;

      // Update confirmation count in DB
      await this.sessionService.updateConfirmations(paymentId, confirmations);

      this.logger.debug(
        `tx ${txHash.slice(0, 10)}… has ${confirmations}/${chainCfg.requiredConfirmations} confirmations`,
      );

      // Check if we've reached the threshold
      if (confirmations >= chainCfg.requiredConfirmations) {
        await this.sessionService.markConfirmed(sessionId, paymentId);
        this.logger.log(
          `✅ Payment confirmed: session ${sessionId} ` +
            `(${confirmations}/${chainCfg.requiredConfirmations} confirmations)`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Error checking confirmations for payment ${paymentId}: ${err.message}`,
      );
    }
  }
}
