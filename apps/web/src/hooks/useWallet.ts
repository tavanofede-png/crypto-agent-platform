'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
} from 'wagmi';
import { authApi } from '@/lib/api';
import { useStore } from '@/store/useStore';

export function useWalletAuth() {
  const { address, isConnected, status: wagmiStatus } = useAccount();

  const {
    connect:    wagmiConnect,
    connectors,
    isPending:  isWagmiConnecting,
    error:      wagmiConnectError,
    reset:      resetWagmiConnect,
  } = useConnect();

  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { signMessageAsync }            = useSignMessage();
  const { setAuth, logout: storeLogout, user, isAuthenticated, token } = useStore();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError]                        = useState<string | null>(null);

  // ─── Clear stale wagmi errors on mount ──────────────────────────────────────
  // wagmi persists useConnect().error across page navigations.  Resetting on
  // mount prevents a stale error from a previous session from showing immediately.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      resetWagmiConnect();
    }
  }, [resetWagmiConnect]);

  // ─── Sync NEW wagmi connect errors into our error state ──────────────────────
  // Only react after mount (the reset above already cleared the stale value).
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!wagmiConnectError) return;

    const msg = wagmiConnectError.message ?? 'Failed to connect wallet';
    if (
      msg.includes('No injected provider') ||
      msg.includes('window.ethereum') ||
      msg.includes('not found') ||
      msg.includes('not installed') ||
      msg.includes('ConnectorNotFound')
    ) {
      setError('No browser wallet detected. Install MetaMask or Beexo, then try again.');
    } else if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
      setError('Connection rejected — approve the request in your wallet.');
    } else {
      setError(msg);
    }
  }, [wagmiConnectError]);

  // ─── Wrapped connect — adds mutation callbacks ───────────────────────────────
  // Using wagmi's mutation onError instead of relying solely on the error state
  // above, so errors are caught even when wagmiConnectError doesn't re-fire.
  const connect = useCallback(
    (params: { connector: (typeof connectors)[number] }) => {
      setError(null);
      wagmiConnect(params, {
        onError: (err) => {
          const msg = err.message ?? 'Failed to connect wallet';
          if (
            msg.includes('No injected provider') ||
            msg.includes('window.ethereum') ||
            msg.includes('not found') ||
            msg.includes('not installed')
          ) {
            setError(
              'No browser wallet detected. Install MetaMask or Beexo, then try again.',
            );
          } else if (msg.includes('rejected') || msg.includes('denied') || msg.includes('User rejected')) {
            setError('Connection rejected — please approve the request in your wallet.');
          } else {
            setError(msg);
          }
        },
      });
    },
    [wagmiConnect],
  );

  // ─── Full authentication flow ────────────────────────────────────────────────
  const authenticate = useCallback(
    async (walletAddress: string) => {
      setIsAuthenticating(true);
      setError(null);

      try {
        const { nonce, message } = await authApi.requestNonce(walletAddress);
        const signature = await signMessageAsync({ message });
        const { accessToken, refreshToken, user: authedUser } = await authApi.verify({
          walletAddress,
          nonce,
          message,
          signature,
        });
        setAuth(authedUser, accessToken, refreshToken);
      } catch (err: any) {
        const raw =
          err.shortMessage ??
          err.response?.data?.message ??
          err.message ??
          'Authentication failed';

        const friendly =
          raw.includes('rejected') || raw.includes('denied') || raw.includes('User rejected')
            ? 'Signature rejected — please approve the sign request in your wallet.'
            : raw;

        setError(friendly);
        throw err;
      } finally {
        setIsAuthenticating(false);
      }
    },
    [signMessageAsync, setAuth],
  );

  // ─── Logout ──────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Stateless JWT — best-effort
    } finally {
      wagmiDisconnect();
      storeLogout();
    }
  }, [wagmiDisconnect, storeLogout]);

  return {
    address:      address ?? null,
    isConnected,
    isConnecting: isWagmiConnecting,
    wagmiStatus,
    connectors,
    connect,
    isAuthenticated,
    user,
    authToken: token,
    isLoading:      isWagmiConnecting || isAuthenticating,
    isAuthenticating,
    error,
    setError,
    authenticate,
    logout,
    disconnect: logout,
    signIn:     authenticate,
  };
}

export { useWalletAuth as useWallet };
