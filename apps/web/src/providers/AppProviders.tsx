'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '@/lib/wagmi';
import { useStore } from '@/store/useStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

/**
 * Listens for the `auth:logout` window event dispatched by the axios
 * 401 interceptor when the refresh token is also expired or missing.
 * Clears the Zustand session and redirects to /connect.
 */
function AuthListener({ children }: { children: React.ReactNode }) {
  const logout = useStore((s) => s.logout);
  const router = useRouter();

  useEffect(() => {
    const handleLogout = () => {
      logout();
      router.replace('/connect');
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [logout, router]);

  return <>{children}</>;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthListener>{children}</AuthListener>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
