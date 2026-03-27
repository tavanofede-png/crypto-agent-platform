import { createConfig, http } from 'wagmi';
import { mainnet, polygon, arbitrum } from 'wagmi/chains';
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

export const wagmiConfig = createConfig({
  chains: [mainnet, polygon, arbitrum],
  connectors: [
    injected({
      target() {
        return {
          id: 'beexo',
          name: 'Beexo Wallet',
          provider: typeof window !== 'undefined' ? (window as any).beexo ?? (window as any).ethereum : undefined,
        };
      },
    }),
    injected({ target: 'metaMask' }),
    coinbaseWallet({ appName: 'Crypto Agent Platform' }),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
  },
});

export type WagmiConfig = typeof wagmiConfig;
