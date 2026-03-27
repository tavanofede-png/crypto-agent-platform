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
};

module.exports = nextConfig;
