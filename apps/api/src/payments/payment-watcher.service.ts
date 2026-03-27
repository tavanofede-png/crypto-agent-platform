/**
 * PaymentWatcherService
 *
 * Background service that polls every configured EVM chain for new blocks
 * and detects incoming payments to the treasury wallet.
 *
 * Architecture:
 *  - One polling loop per chain (setInterval, cadence = chain.pollIntervalMs)
 *  - Each tick processes up to MAX_BLOCKS_PER_TICK blocks
 *  - Last processed block is kept in memory (survives restarts via -10 offset)
 *
 * Detection flow:
 *  1. For native token: scan each block's transactions, filter to.treasury && value > 0
 *  2. For ERC-20: getLogs(Transfer, to=treasury) over the block range
 *  3. For each match: check ProcessedChainEvent for idempotency
 *  4. If new: call PaymentSessionService.matchTransferToSession()
 *  5. If session found: mark DETECTED, create BlockchainPayment record
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChainService } from '../chain/chain.service';
import { PaymentSessionService } from './payment-session.service';

const MAX_BLOCKS_PER_TICK = 20;

@Injectable()
export class PaymentWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentWatcherService.name);

  /** In-memory last-processed block per chain */
  private lastProcessedBlock = new Map<number, bigint>();
  private intervals: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly chainService: ChainService,
    private readonly sessionService: PaymentSessionService,
  ) {}

  async onModuleInit() {
    const chains = this.chainService.getSupportedChains();

    if (chains.length === 0) {
      this.logger.warn('No chains configured — payment watcher is idle');
      return;
    }

    for (const chain of chains) {
      await this.startChainWatcher(chain.id, chain.pollIntervalMs);
    }
  }

  onModuleDestroy() {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
  }

  // ─── Per-chain watcher ─────────────────────────────────────

  private async startChainWatcher(chainId: number, pollMs: number) {
    try {
      const currentBlock = await this.chainService.getBlockNumber(chainId);
      // Start 10 blocks back to catch payments that arrived during restart
      const startFrom = currentBlock > 10n ? currentBlock - 10n : 0n;
      this.lastProcessedBlock.set(chainId, startFrom);

      const handle = setInterval(() => this.pollChain(chainId), pollMs);
      this.intervals.push(handle);

      this.logger.log(
        `Watcher started for chain ${chainId} (poll: ${pollMs}ms, from block ${startFrom})`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to start watcher for chain ${chainId}: ${err.message}`);
    }
  }

  private async pollChain(chainId: number) {
    try {
      const latestBlock = await this.chainService.getBlockNumber(chainId);
      const lastBlock = this.lastProcessedBlock.get(chainId) ?? latestBlock;

      const fromBlock = lastBlock + 1n;
      if (fromBlock > latestBlock) return; // no new blocks

      // Cap to avoid large getLogs calls
      const toBlock =
        latestBlock - fromBlock >= BigInt(MAX_BLOCKS_PER_TICK)
          ? fromBlock + BigInt(MAX_BLOCKS_PER_TICK) - 1n
          : latestBlock;

      this.logger.debug(
        `Chain ${chainId}: scanning blocks ${fromBlock}–${toBlock}`,
      );

      await Promise.all([
        this.processNativeTransfers(chainId, fromBlock, toBlock),
        this.processERC20Transfers(chainId, fromBlock, toBlock),
        this.sessionService.expireStaleSessionsJob(),
      ]);

      this.lastProcessedBlock.set(chainId, toBlock);
    } catch (err: any) {
      this.logger.error(`Chain ${chainId} poll error: ${err.message}`);
      // Don't advance lastProcessedBlock on error — retry next tick
    }
  }

  // ─── Native token detection ────────────────────────────────

  private async processNativeTransfers(
    chainId: number,
    fromBlock: bigint,
    toBlock: bigint,
  ) {
    const treasury = this.chainService.getTreasuryAddress();
    const transfers = await this.chainService.getNativeTransfersTo(
      chainId,
      treasury,
      fromBlock,
      toBlock,
    );

    for (const tx of transfers) {
      await this.handleTransfer({
        chainId,
        txHash: tx.txHash,
        blockNumber: tx.blockNumber,
        fromAddress: tx.fromAddress,
        toAddress: tx.toAddress,
        tokenAddress: null,
        amount: tx.value,
        logIndex: null,
        eventType: 'native_transfer',
      });
    }
  }

  // ─── ERC-20 detection ──────────────────────────────────────

  private async processERC20Transfers(
    chainId: number,
    fromBlock: bigint,
    toBlock: bigint,
  ) {
    const cfg = this.chainService.getChainConfig(chainId);
    const treasury = this.chainService.getTreasuryAddress();

    for (const token of cfg.supportedTokens) {
      const transfers = await this.chainService.getERC20TransfersTo(
        chainId,
        this.chainService.checksumAddress(token.address),
        treasury,
        fromBlock,
        toBlock,
      );

      for (const log of transfers) {
        await this.handleTransfer({
          chainId,
          txHash: log.txHash,
          blockNumber: log.blockNumber,
          fromAddress: log.fromAddress,
          toAddress: log.toAddress,
          tokenAddress: log.tokenAddress,
          amount: log.value,
          logIndex: log.logIndex,
          eventType: 'erc20_transfer',
        });
      }
    }
  }

  // ─── Core handler (idempotency + session matching) ─────────

  private async handleTransfer(params: {
    chainId: number;
    txHash: string;
    blockNumber: number;
    fromAddress: string;
    toAddress: string;
    tokenAddress: string | null;
    amount: bigint;
    logIndex: number | null;
    eventType: string;
  }) {
    const {
      chainId,
      txHash,
      blockNumber,
      fromAddress,
      toAddress,
      tokenAddress,
      amount,
      logIndex,
      eventType,
    } = params;

    // ── 1. Idempotency check ──────────────────────────────────
    // Unique key: (chainId, txHash, logIndex)
    // This prevents a network retry or restart from double-processing.
    try {
      await this.prisma.processedChainEvent.create({
        data: { chainId, txHash, logIndex, eventType },
      });
    } catch {
      // Unique constraint violation — already processed, skip
      return;
    }

    // ── 2. Match to a payment session ─────────────────────────
    const session = await this.sessionService.matchTransferToSession({
      chainId,
      fromAddress: fromAddress.toLowerCase(),
      tokenAddress: tokenAddress?.toLowerCase() ?? null,
      amountReceived: amount,
    });

    if (!session) {
      this.logger.debug(
        `Transfer ${txHash} on chain ${chainId} from ${fromAddress.slice(0, 8)}… ` +
          `did not match any pending session`,
      );
      return;
    }

    // ── 3. Mark session as DETECTED ───────────────────────────
    try {
      await this.sessionService.markDetected(
        session.id,
        txHash,
        blockNumber,
        chainId,
        fromAddress,
        toAddress,
        tokenAddress,
        amount,
      );

      this.logger.log(
        `Payment matched! session=${session.id} tx=${txHash} ` +
          `amount=${amount} from=${fromAddress.slice(0, 8)}…`,
      );
    } catch (err: any) {
      this.logger.error(
        `Failed to record payment for session ${session.id}: ${err.message}`,
      );
    }
  }
}
