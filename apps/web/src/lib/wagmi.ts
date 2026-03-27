import { createConfig, http } from 'wagmi';
import { mainnet, polygon, arbitrum, base, optimism, sepolia, polygonAmoy } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

export const wagmiConfig = createConfig({
  // Include all chains supported by the backend + common testnets for dev
  chains: [mainnet, polygon, arbitrum, base, optimism, sepolia, polygonAmoy],
  connectors: [
    injected({
      target() {
        return {
          id: 'beexo',
          name: 'Beexo Wallet',
          provider:
            typeof window !== 'undefined'
              ? (window as any).beexo ?? (window as any).ethereum
              : undefined,
        };
      },
    }),
    injected({ target: 'metaMask' }),
    coinbaseWallet({ appName: 'Crypto Agent Platform' }),
  ],
  transports: {
    [mainnet.id]:     http(),
    [polygon.id]:     http(),
    [arbitrum.id]:    http(),
    [base.id]:        http(),
    [optimism.id]:    http(),
    [sepolia.id]:     http(),
    [polygonAmoy.id]: http(),
  },
});

export type WagmiConfig = typeof wagmiConfig;
