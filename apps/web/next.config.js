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
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  },
  // WalletConnect's SDK references pino-pretty optionally at runtime.
  // Alias it to false so webpack doesn't throw a "module not found" warning.
  webpack(config) {
    config.resolve.alias['pino-pretty'] = false;
    return config;
  },
};

module.exports = nextConfig;
