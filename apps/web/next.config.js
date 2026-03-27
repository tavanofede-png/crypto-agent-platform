/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for `docker build` — the web Dockerfile copies .next/standalone
  output: 'standalone',
  transpilePackages: ['@repo/ui'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@repo/ui'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    // Optional — WalletConnect connector is only added when a real project ID is provided.
    // Get one free at https://cloud.walletconnect.com
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  },
  // wagmi/viem pull in pino-pretty as an optional peer; alias it to false
  // so webpack doesn't emit a "module not found" warning at build time.
  webpack(config) {
    config.resolve.alias['pino-pretty'] = false;
    return config;
  },
};

module.exports = nextConfig;
