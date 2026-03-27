import { createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';

// Minimal wagmi config — connection is handled manually via wallet address input.
// Kept here so <WagmiProvider> in AppProviders doesn't throw.
export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  connectors: [],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

export type WagmiConfig = typeof wagmiConfig;
