'use client';

import { useCallback, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSignMessage } from 'wagmi';
import { authApi } from '@/lib/api';
import { useStore } from '@/store/useStore';

export function useWallet() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();
  const { setAuth, logout, user, isAuthenticated } = useStore();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectAndAuth = useCallback(
    async (connectorId?: string) => {
      setError(null);

      try {
        const connector =
          connectors.find((c) => c.id === connectorId) ?? connectors[0];

        if (!connector) {
          throw new Error('No wallet connector available');
        }

        connect({ connector });
      } catch (err: any) {
        setError(err.message);
      }
    },
    [connect, connectors],
  );

  const authenticate = useCallback(async () => {
    if (!address) return;
    setIsAuthenticating(true);
    setError(null);

    try {
      const { nonce } = await authApi.getNonce(address);
      const message = `Sign in to Crypto Agent Platform\n\nNonce: ${nonce}`;

      let signature: string;
      try {
        signature = await signMessageAsync({ message });
      } catch {
        // Dev mode: use mock signature if wallet refuses
        signature = `0xmock${Date.now().toString(16)}`;
        console.warn('Using mock signature (dev mode)');
      }

      const { accessToken, user } = await authApi.verify(address, signature);
      setAuth(user, accessToken);
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  }, [address, signMessageAsync, setAuth]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    logout();
  }, [disconnect, logout]);

  return {
    address,
    isConnected,
    isAuthenticated,
    isConnecting,
    isAuthenticating,
    user,
    chain,
    connectors,
    error,
    connectAndAuth,
    authenticate,
    disconnect: handleDisconnect,
  };
}
