import { createConfig, http } from 'wagmi';
import { mainnet, sepolia, polygon, arbitrum, base } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

// WalletConnect is optional — only added when a real project ID is provided.
// Get one free at https://cloud.walletconnect.com
const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const hasRealWcId =
  !!wcProjectId &&
  wcProjectId !== 'demo-project-id' &&
  wcProjectId.length > 8;

export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia, polygon, arbitrum, base],
  connectors: [
    // Catches MetaMask, Beexo, Rabby, Coinbase Wallet, and any EIP-1193 injected provider
    injected(),
    ...(hasRealWcId ? [walletConnect({ projectId: wcProjectId! })] : []),
  ],
  transports: {
    [mainnet.id]:  http(),
    [sepolia.id]:  http(),
    [polygon.id]:  http(),
    [arbitrum.id]: http(),
    [base.id]:     http(),
  },
  // Required for Next.js App Router — prevents hydration mismatch
  // by deferring wallet state reads to the client
  ssr: true,
});

export type WagmiConfig = typeof wagmiConfig;
