/**
 * ChainService — viem public client factory and blockchain utilities.
 *
 * Responsibilities:
 *  - Create and cache one PublicClient per chain
 *  - Expose helpers (getBlockNumber, getLogs, getBlock, getTransactionReceipt)
 *  - Provide chain/token configuration lookups
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicClient,
  http,
  parseAbiItem,
  getAddress,
  formatUnits,
  parseUnits,
  PublicClient,
  Address,
  Hash,
  Log,
} from 'viem';
import {
  mainnet,
  polygon,
  arbitrum,
  base,
  optimism,
  bsc,
  sepolia,
  polygonAmoy,
} from 'viem/chains';
import type { Chain } from 'viem/chains';
import { buildChainConfigs, ChainConfig, TokenConfig } from './chain.config';

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
export const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/** viem chain objects keyed by chain ID */
const VIEM_CHAINS: Record<number, Chain> = {
  1:        mainnet,
  137:      polygon,
  42161:    arbitrum,
  8453:     base,
  10:       optimism,
  56:       bsc,
  11155111: sepolia,
  80002:    polygonAmoy,  // Polygon Amoy testnet (replaced Mumbai/80001)
};

export interface NativeTransferInfo {
  txHash: Hash;
  blockNumber: number;
  fromAddress: string;
  toAddress: string;
  value: bigint;
}

export interface ERC20TransferInfo {
  txHash: Hash;
  blockNumber: number;
  logIndex: number;
  fromAddress: string;
  toAddress: string;
  tokenAddress: string;
  value: bigint;
}

@Injectable()
export class ChainService implements OnModuleInit {
  private readonly logger = new Logger(ChainService.name);
  private clients = new Map<number, PublicClient>();
  private configs: ChainConfig[] = [];

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.configs = buildChainConfigs(this.config);

    for (const cfg of this.configs) {
      const chain = VIEM_CHAINS[cfg.id];
      if (!chain) {
        this.logger.warn(
          `No viem chain definition for chainId ${cfg.id} — custom chain definitions not yet supported`,
        );
        continue;
      }

      const client = createPublicClient({
        chain,
        transport: http(cfg.rpcUrl, {
          retryCount: 3,
          retryDelay: 1000,
          timeout: 15_000,
        }),
      });

      this.clients.set(cfg.id, client);
      this.logger.log(`Initialized viem client for ${cfg.name} (chainId: ${cfg.id})`);
    }
  }

  // ─── Client & Config accessors ─────────────────────────────

  getClient(chainId: number): PublicClient {
    const client = this.clients.get(chainId);
    if (!client) throw new Error(`No viem client for chainId ${chainId}`);
    return client;
  }

  getSupportedChains(): ChainConfig[] {
    return this.configs;
  }

  getChainConfig(chainId: number): ChainConfig {
    const cfg = this.configs.find((c) => c.id === chainId);
    if (!cfg) throw new Error(`Chain ${chainId} is not configured`);
    return cfg;
  }

  isChainSupported(chainId: number): boolean {
    return this.configs.some((c) => c.id === chainId);
  }

  getTokenConfig(chainId: number, tokenAddress: string): TokenConfig | undefined {
    const cfg = this.getChainConfig(chainId);
    return cfg.supportedTokens.find(
      (t) => t.address.toLowerCase() === tokenAddress.toLowerCase(),
    );
  }

  getTreasuryAddress(): Address {
    const addr = this.config.get<string>('TREASURY_ADDRESS');
    if (!addr) throw new Error('TREASURY_ADDRESS env var is not set');
    return getAddress(addr);
  }

  // ─── Block utilities ───────────────────────────────────────

  async getBlockNumber(chainId: number): Promise<bigint> {
    return this.getClient(chainId).getBlockNumber();
  }

  /**
   * Returns native-token transfers TO a given address within a block range.
   * We retrieve each block with full transactions to filter by `to` address.
   * Note: This is intentionally limited to small block ranges (≤20 blocks)
   * per call to avoid hammering the RPC.
   */
  async getNativeTransfersTo(
    chainId: number,
    toAddress: Address,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<NativeTransferInfo[]> {
    const client = this.getClient(chainId);
    const treasury = toAddress.toLowerCase();
    const results: NativeTransferInfo[] = [];

    for (let n = fromBlock; n <= toBlock; n++) {
      try {
        const block = await client.getBlock({
          blockNumber: n,
          includeTransactions: true,
        });

        for (const tx of block.transactions) {
          if (
            tx.to?.toLowerCase() === treasury &&
            tx.value > 0n
          ) {
            results.push({
              txHash: tx.hash,
              blockNumber: Number(block.number),
              fromAddress: tx.from,
              toAddress: tx.to,
              value: tx.value,
            });
          }
        }
      } catch (err: any) {
        this.logger.warn(`getBlock ${n} on chain ${chainId} failed: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Returns ERC-20 Transfer events where `to == toAddress` for the given
   * token contract within the block range.
   * Uses getLogs with a topic filter — single RPC call per token.
   */
  async getERC20TransfersTo(
    chainId: number,
    tokenAddress: Address,
    toAddress: Address,
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<ERC20TransferInfo[]> {
    const client = this.getClient(chainId);

    let logs: Log[];
    try {
      logs = await client.getLogs({
        address: tokenAddress,
        event: ERC20_TRANSFER_EVENT,
        args: { to: toAddress },
        fromBlock,
        toBlock,
      });
    } catch (err: any) {
      this.logger.warn(`getLogs on chain ${chainId} failed: ${err.message}`);
      return [];
    }

    return logs
      .filter((log) => log.args && log.transactionHash && log.blockNumber !== null)
      .map((log) => ({
        txHash: log.transactionHash as Hash,
        blockNumber: Number(log.blockNumber),
        logIndex: log.logIndex ?? 0,
        fromAddress: (log.args as any).from as string,
        toAddress: (log.args as any).to as string,
        tokenAddress: log.address,
        value: (log.args as any).value as bigint,
      }));
  }

  // ─── Transaction verification ──────────────────────────────

  /**
   * Verify a transaction receipt and return the current confirmation count.
   * Returns null if the tx is not found or still pending.
   */
  async getConfirmationCount(
    chainId: number,
    txHash: Hash,
  ): Promise<{ receipt: any; confirmations: number } | null> {
    const client = this.getClient(chainId);

    try {
      const [receipt, currentBlock] = await Promise.all([
        client.getTransactionReceipt({ hash: txHash }),
        client.getBlockNumber(),
      ]);

      if (!receipt || receipt.blockNumber === null) return null;

      const confirmations = Number(currentBlock - receipt.blockNumber) + 1;
      return { receipt, confirmations };
    } catch {
      return null;
    }
  }

  // ─── Amount helpers ────────────────────────────────────────

  /**
   * Convert a human-readable amount string (e.g. "5.00") to the smallest
   * token unit as a bigint. Uses viem's parseUnits.
   */
  toSmallestUnit(amount: string, decimals: number): bigint {
    return parseUnits(amount, decimals);
  }

  /**
   * Convert a smallest-unit bigint to a human-readable string.
   */
  fromSmallestUnit(amount: bigint, decimals: number): string {
    return formatUnits(amount, decimals);
  }

  checksumAddress(address: string): Address {
    return getAddress(address);
  }
}
