/**
 * Chain and token configuration.
 *
 * All values are read from environment variables so chains/tokens can be
 * configured per deployment without touching code.
 *
 * Matching strategy (MVP):
 *   We match an incoming transfer to a PaymentSession by comparing the
 *   sender's address (tx.from / log.args.from) to the session.walletAddress
 *   that was stored when the session was created. Because users authenticate
 *   with their wallet, this address is reliable. See PaymentWatcherService for
 *   the full matching logic.
 */

import { ConfigService } from '@nestjs/config';

export interface TokenConfig {
  symbol: string;
  address: string;   // checksummed ERC-20 contract address
  decimals: number;
}

export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** Seconds between blocks — used to estimate poll interval */
  blockTimeSeconds: number;
  /** How often (ms) the watcher polls for new blocks */
  pollIntervalMs: number;
  /** Blocks required before a payment is marked CONFIRMED */
  requiredConfirmations: number;
  supportedTokens: TokenConfig[];
}

/** Parses "SYMBOL:address:decimals,..." env string into TokenConfig[] */
function parseTokenList(raw?: string): TokenConfig[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const [symbol, address, dec] = t.split(':');
      if (!symbol || !address || !dec) return null;
      return { symbol: symbol.toUpperCase(), address, decimals: parseInt(dec, 10) };
    })
    .filter((t): t is TokenConfig => t !== null);
}

export function buildChainConfigs(config: ConfigService): ChainConfig[] {
  // Default: no chains — API starts without requiring CHAIN_*_RPC_URL (e.g. Railway before you add an RPC).
  // Set ACTIVE_CHAINS=11155111 (and CHAIN_11155111_RPC_URL) when you want on-chain payment detection.
  const raw = config.get<string>('ACTIVE_CHAINS', '');
  const chainIds = raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  // Default names / block times for known chains
  const META: Record<number, { name: string; native: string; blockTime: number }> = {
    1:        { name: 'Ethereum',          native: 'ETH',  blockTime: 12 },
    137:      { name: 'Polygon',           native: 'MATIC', blockTime: 2  },
    42161:    { name: 'Arbitrum One',      native: 'ETH',  blockTime: 1  },
    8453:     { name: 'Base',              native: 'ETH',  blockTime: 2  },
    10:       { name: 'Optimism',          native: 'ETH',  blockTime: 2  },
    56:       { name: 'BNB Chain',         native: 'BNB',  blockTime: 3  },
    11155111: { name: 'Sepolia',           native: 'ETH',  blockTime: 12 },
    80002:    { name: 'Polygon Amoy',      native: 'MATIC', blockTime: 2  }, // replaced Mumbai (80001)
  };

  return chainIds.map((id) => {
    const rpcUrl = config.get<string>(`CHAIN_${id}_RPC_URL`);
    if (!rpcUrl) {
      throw new Error(
        `CHAIN_${id}_RPC_URL is required but not set. Add it to your .env file.`,
      );
    }

    const meta = META[id] ?? { name: `Chain ${id}`, native: 'ETH', blockTime: 12 };
    const requiredConfs =
      config.get<number>(`REQUIRED_CONFIRMATIONS_${id}`) ??
      config.get<number>('REQUIRED_CONFIRMATIONS_DEFAULT', 2);

    const blockTime = meta.blockTime;

    return {
      id,
      name: meta.name,
      rpcUrl,
      nativeSymbol: meta.native,
      nativeDecimals: 18,
      blockTimeSeconds: blockTime,
      pollIntervalMs: Math.max(blockTime * 1000, 5000), // min 5s poll
      requiredConfirmations: Number(requiredConfs),
      supportedTokens: parseTokenList(config.get<string>(`CHAIN_${id}_TOKENS`)),
    };
  });
}

/** Well-known ERC-20 token addresses per chain (for convenience) */
export const KNOWN_TOKENS: Record<number, Record<string, string>> = {
  1: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  137: {
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  },
  42161: {
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  8453: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  11155111: {
    // Sepolia test tokens — deploy your own or use Circle's faucet
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  },
  80002: {
    // Polygon Amoy (testnet) test tokens
    USDC: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
  },
};
