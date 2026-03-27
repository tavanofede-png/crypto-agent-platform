'use client';

import { useCallback, useState } from 'react';
import { authApi } from '@/lib/api';
import { useStore } from '@/store/useStore';

export function useWallet() {
  const { setAuth, logout, user, isAuthenticated } = useStore();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Sign in with a Beexo wallet address — no browser extension needed. */
  const signIn = useCallback(
    async (walletAddress: string) => {
      setIsAuthenticating(true);
      setError(null);

      try {
        const { nonce } = await authApi.getNonce(walletAddress);
        // Backend accepts signatures starting with "0xmock" in dev mode
        const signature = `0xmock-beexo-${nonce}-${Date.now().toString(16)}`;
        const { accessToken, user: authedUser } = await authApi.verify(
          walletAddress,
          signature,
        );
        setAuth(authedUser, accessToken);
      } catch (err: any) {
        setError(
          err.response?.data?.message ?? err.message ?? 'Authentication failed',
        );
      } finally {
        setIsAuthenticating(false);
      }
    },
    [setAuth],
  );

  const disconnect = useCallback(() => {
    logout();
  }, [logout]);

  return {
    address: user?.walletAddress ?? null,
    isAuthenticated,
    isAuthenticating,
    user,
    error,
    signIn,
    disconnect,
    // Legacy aliases used by Navbar and other components
    isConnected: isAuthenticated,
    isConnecting: isAuthenticating,
  };
}
