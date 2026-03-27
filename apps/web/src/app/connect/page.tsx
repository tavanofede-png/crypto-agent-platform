'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import {
  Cpu,
  Loader2,
  AlertCircle,
  Wallet,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { useWalletAuth } from '@/hooks/useWallet';

// ─── Auth step state machine ──────────────────────────────────────────────────

type Step =
  | 'idle'          // No wallet connected — show connector list
  | 'connecting'    // wagmi connect() in flight
  | 'signing'       // Nonce fetched — wallet popup open
  | 'verifying'     // POST /auth/verify in flight
  | 'done';         // JWT received — will redirect

const STEP_LABELS: Record<Step, string | null> = {
  idle:       null,
  connecting: 'Opening wallet…',
  signing:    'Check your wallet — approve the sign request',
  verifying:  'Verifying signature…',
  done:       'Authenticated!',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ConnectorIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (n.includes('metamask'))      return <span className="text-xl leading-none">🦊</span>;
  if (n.includes('coinbase'))      return <span className="text-xl leading-none">🔵</span>;
  if (n.includes('walletconnect')) return <span className="text-xl leading-none">🔗</span>;
  if (n.includes('rabby'))         return <span className="text-xl leading-none">🐇</span>;
  if (n.includes('beexo'))         return <span className="text-xl leading-none">🐝</span>;
  return <Wallet className="h-5 w-5 text-violet-400" />;
}

function connectorDescription(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('injected') || n.includes('browser'))
    return 'MetaMask · Beexo · Rabby · Coinbase Wallet';
  if (n.includes('walletconnect'))
    return 'Mobile & hardware wallets via QR code';
  return 'EIP-1193 compatible';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConnectPage() {
  const router = useRouter();

  const {
    isAuthenticated,
    isConnected,
    address,
    isConnecting,
    isAuthenticating,
    connectors,
    connect,
    authenticate,
    logout,
    error,
    setError,
  } = useWalletAuth();

  useAccount(); // keeps wagmi state fresh

  const [step, setStep]                     = useState<Step>('idle');
  const [connectingId, setConnectingId]     = useState<string | null>(null);
  const authTriggeredRef                    = useRef(false);

  // ── Redirect once authenticated ──────────────────────────────────────────
  useEffect(() => {
    if (isAuthenticated) {
      setStep('done');
      router.replace('/agents');
    }
  }, [isAuthenticated, router]);

  // ── Sync connecting state ────────────────────────────────────────────────
  useEffect(() => {
    if (isConnecting) {
      setStep('connecting');
    } else if (!isConnected && step === 'connecting') {
      // Connect finished but no wallet → error was set by the hook.
      setStep('idle');
      setConnectingId(null);
    }
  }, [isConnecting, isConnected]);

  // ── When error appears, reset spinners ──────────────────────────────────
  useEffect(() => {
    if (error) {
      setStep('idle');
      setConnectingId(null);
      authTriggeredRef.current = false;
    }
  }, [error]);

  // ── Auto-trigger auth once wallet connects ───────────────────────────────
  useEffect(() => {
    if (
      isConnected &&
      address &&
      !isAuthenticated &&
      !isAuthenticating &&
      !authTriggeredRef.current
    ) {
      authTriggeredRef.current = true;
      runAuth(address);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  // ── Auth flow ─────────────────────────────────────────────────────────────
  const runAuth = async (walletAddress: string) => {
    setError(null);
    setStep('signing');
    try {
      await authenticate(walletAddress);
      // On success → isAuthenticated flips → redirect useEffect fires.
    } catch {
      // error is already set inside authenticate()
      setStep('idle');
      setConnectingId(null);
      authTriggeredRef.current = false;
      logout();
    }
  };

  // ── Connect handler ──────────────────────────────────────────────────────
  const handleConnect = (connector: (typeof connectors)[number]) => {
    setConnectingId(connector.id);
    setError(null);
    authTriggeredRef.current = false;
    connect({ connector });
    // If there's no wallet installed, wagmi will emit an error via
    // useConnect().error → the hook's useEffect will surface it.
  };

  const handleRetry = () => {
    setError(null);
    setStep('idle');
    setConnectingId(null);
    authTriggeredRef.current = false;
    if (isConnected && address) {
      runAuth(address);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const isBusy    = step !== 'idle' && step !== 'done';
  const stepLabel = STEP_LABELS[step];

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Background glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 border-b border-zinc-800/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center">
          <div className="flex items-center gap-2">
            <Cpu className="h-6 w-6 text-violet-400" />
            <span className="font-semibold text-white">CryptoAgent</span>
          </div>
        </div>
      </header>

      {/* Center card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm space-y-5">

          {/* Heading */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium px-3 py-1.5 rounded-full mb-5">
              <ShieldCheck className="h-3.5 w-3.5" />
              Cryptographic Sign-In
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Connect your wallet</h1>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Sign a message to prove wallet ownership.
              <br />
              No transaction. No gas.
            </p>
          </div>

          {/* Progress indicator */}
          {isBusy && stepLabel && (
            <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3.5 text-sm text-violet-300">
              <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
              <span>{stepLabel}</span>
            </div>
          )}

          {/* Success */}
          {step === 'done' && (
            <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3.5 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              Authenticated — redirecting…
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-3">
              <div className="flex gap-2 items-start text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try again
                </button>
                {error.includes('Install') && (
                  <a
                    href="https://metamask.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Install MetaMask
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Connector buttons */}
          {!isBusy && step !== 'done' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2.5">

              {connectors.length === 0 ? (
                <div className="text-center text-zinc-500 text-sm py-4 space-y-3">
                  <p>No wallet connectors available.</p>
                  <a
                    href="https://metamask.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-violet-400 hover:underline"
                  >
                    Install MetaMask <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ) : (
                connectors.map((connector) => {
                  const isThisConnecting = connectingId === connector.id && isBusy;
                  const displayName =
                    connector.name === 'Injected' ? 'Browser Wallet' : connector.name;

                  return (
                    <button
                      key={connector.id}
                      onClick={() => handleConnect(connector)}
                      disabled={isBusy}
                      className="w-full flex items-center gap-4 bg-zinc-800 hover:bg-zinc-700/80 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700/60 hover:border-zinc-600 rounded-xl px-4 py-3.5 transition-all text-left"
                    >
                      <div className="flex-shrink-0 w-7 flex items-center justify-center">
                        {isThisConnecting
                          ? <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                          : <ConnectorIcon name={connector.name} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">{displayName}</div>
                        <div className="text-xs text-zinc-500 truncate">
                          {connectorDescription(connector.name)}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}

              {/* Flow steps */}
              <div className="pt-1 border-t border-zinc-800 text-xs text-zinc-600 space-y-1 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-mono flex-shrink-0">1</span>
                  Connect wallet provider
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-mono flex-shrink-0">2</span>
                  Sign authentication message
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] font-mono flex-shrink-0">3</span>
                  Session started — no transaction required
                </div>
              </div>
            </div>
          )}

          <p className="text-center text-zinc-700 text-xs leading-relaxed">
            Your private key never leaves your wallet.
            <br />
            CryptoAgent never asks for your seed phrase.
          </p>

        </div>
      </main>
    </div>
  );
}
