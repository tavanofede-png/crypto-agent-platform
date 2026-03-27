'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Cpu, Wallet, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';

export default function ConnectPage() {
  const router = useRouter();
  const {
    address,
    isConnected,
    isAuthenticated,
    isConnecting,
    isAuthenticating,
    connectors,
    error,
    connectAndAuth,
    authenticate,
  } = useWallet();

  useEffect(() => {
    if (isAuthenticated) router.replace('/agents');
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (isConnected && !isAuthenticated && !isAuthenticating) {
      authenticate();
    }
  }, [isConnected, isAuthenticated, isAuthenticating, authenticate]);

  const step = !isConnected ? 1 : !isAuthenticated ? 2 : 3;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-violet-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <Cpu className="h-7 w-7 text-violet-400" />
          <span className="font-bold text-xl text-white">CryptoAgent</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h1 className="text-2xl font-bold text-white mb-2">Connect Wallet</h1>
          <p className="text-zinc-400 text-sm mb-8">
            Sign in with your Web3 wallet to manage your AI agents
          </p>

          {/* Steps */}
          <div className="flex items-center gap-3 mb-8">
            {['Connect', 'Sign', 'Launch'].map((label, i) => (
              <div key={label} className="flex items-center gap-3 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                      i + 1 < step
                        ? 'bg-emerald-500 text-white'
                        : i + 1 === step
                          ? 'bg-violet-600 text-white ring-2 ring-violet-400/30'
                          : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {i + 1 < step ? '✓' : i + 1}
                  </div>
                  <span
                    className={`text-xs font-medium ${i + 1 <= step ? 'text-zinc-200' : 'text-zinc-600'}`}
                  >
                    {label}
                  </span>
                </div>
                {i < 2 && <div className="flex-1 h-px bg-zinc-800" />}
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="flex gap-2 items-start bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg p-3 mb-6">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Wallet buttons */}
          {!isConnected && (
            <div className="space-y-3">
              {connectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => connectAndAuth(connector.id)}
                  disabled={isConnecting}
                  className="w-full flex items-center gap-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 text-white font-medium px-4 py-3.5 rounded-xl transition-all disabled:opacity-50"
                >
                  <Wallet className="h-5 w-5 text-violet-400" />
                  <span>{connector.name}</span>
                  {isConnecting ? (
                    <Loader2 className="h-4 w-4 ml-auto animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4 ml-auto text-zinc-500" />
                  )}
                </button>
              ))}

              <div className="pt-4 border-t border-zinc-800">
                <p className="text-xs text-zinc-600 text-center">
                  Don&apos;t have a wallet?{' '}
                  <a
                    href="https://beexo.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet-400 hover:text-violet-300"
                  >
                    Get Beexo
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* Signing state */}
          {isConnected && !isAuthenticated && (
            <div className="text-center py-4">
              <Loader2 className="h-8 w-8 animate-spin text-violet-400 mx-auto mb-3" />
              <p className="text-white font-medium">Waiting for signature…</p>
              <p className="text-zinc-500 text-sm mt-1 mb-4">
                Check your wallet for a sign request
              </p>
              <code className="text-xs text-zinc-600 bg-zinc-800/60 px-3 py-1.5 rounded-full">
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </code>
            </div>
          )}
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          By connecting you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}
