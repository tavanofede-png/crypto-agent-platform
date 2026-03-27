'use client';

import { useEffect, useState } from 'react';
import {
  X,
  Copy,
  CheckCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Wallet,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { usePaymentSession, type SessionStatus, type PaymentSession } from '@/hooks/usePaymentSession';
import { cn } from '@repo/ui';

interface Props {
  purpose: 'AGENT_CREATION' | 'CREDIT_TOPUP';
  /** Called when the session is confirmed — parent should refresh data */
  onConfirmed: (session: PaymentSession) => void;
  onClose: () => void;
  /** If provided, pre-select this chain */
  defaultChainId?: number;
}

// ─── Status display config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; description: string; color: string; icon: React.ReactNode }
> = {
  idle:            { label: 'Preparing…',          description: '', color: 'text-zinc-400', icon: <Loader2 className="h-5 w-5 animate-spin" /> },
  creating:        { label: 'Creating session…',   description: 'Setting up your payment session', color: 'text-zinc-400', icon: <Loader2 className="h-5 w-5 animate-spin" /> },
  awaiting_payment:{ label: 'Awaiting payment',    description: 'Send the exact amount below to the treasury address', color: 'text-amber-400', icon: <Clock className="h-5 w-5" /> },
  sending:         { label: 'Confirm in wallet…',  description: 'Check your wallet for a transaction prompt', color: 'text-violet-400', icon: <Wallet className="h-5 w-5 animate-pulse" /> },
  tx_submitted:    { label: 'Transaction sent!',   description: 'Waiting for the network to pick it up', color: 'text-blue-400', icon: <Loader2 className="h-5 w-5 animate-spin" /> },
  detected:        { label: 'Payment detected',    description: 'Transaction found on-chain — waiting for confirmations', color: 'text-blue-400', icon: <ShieldCheck className="h-5 w-5 animate-pulse" /> },
  confirming:      { label: 'Confirming…',         description: 'Accumulating block confirmations', color: 'text-blue-400', icon: <Loader2 className="h-5 w-5 animate-spin" /> },
  confirmed:       { label: 'Payment confirmed!',  description: 'Credits have been added to your account', color: 'text-emerald-400', icon: <CheckCircle className="h-5 w-5" /> },
  expired:         { label: 'Session expired',     description: 'The payment window has closed. Create a new session.', color: 'text-red-400', icon: <AlertTriangle className="h-5 w-5" /> },
  error:           { label: 'Error',               description: '', color: 'text-red-400', icon: <AlertTriangle className="h-5 w-5" /> },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
      title="Copy"
    >
      {copied ? (
        <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function ConfirmationBar({ current, required }: { current: number; required: number }) {
  const pct = Math.min((current / required) * 100, 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-zinc-400">
        <span>Confirmations</span>
        <span className="font-mono">
          {current} / {required}
        </span>
      </div>
      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-violet-600 to-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ExpiryTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Expired'); return; }
      const m = Math.floor(diff / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const isUrgent = new Date(expiresAt).getTime() - Date.now() < 3 * 60_000;

  return (
    <span className={cn('font-mono text-xs', isUrgent ? 'text-red-400' : 'text-zinc-500')}>
      {remaining}
    </span>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function PaymentSessionModal({ purpose, onConfirmed, onClose, defaultChainId }: Props) {
  const {
    uiStatus,
    session,
    error,
    userTxHash,
    connectedChainId,
    createSession,
    sendPayment,
    reset,
  } = usePaymentSession();

  const statusCfg = STATUS_CONFIG[uiStatus];
  const isTerminal = ['confirmed', 'expired', 'error'].includes(uiStatus);
  const chainId = defaultChainId ?? connectedChainId ?? 11155111;

  // Auto-create session when modal opens
  useEffect(() => {
    createSession({ purpose, chainId });
  }, []);

  useEffect(() => {
    if (uiStatus === 'confirmed' && session) {
      onConfirmed(session);
    }
  }, [uiStatus, session, onConfirmed]);

  const purposeLabel =
    purpose === 'AGENT_CREATION' ? 'Agent Creation' : 'Credit Top-Up';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-semibold text-white">Pay with Crypto</h2>
            <p className="text-xs text-zinc-500">{purposeLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status banner */}
          <div
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl border',
              uiStatus === 'confirmed'
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : uiStatus === 'expired' || uiStatus === 'error'
                  ? 'bg-red-500/10 border-red-500/20'
                  : 'bg-zinc-800/60 border-zinc-700/60',
            )}
          >
            <span className={statusCfg.color}>{statusCfg.icon}</span>
            <div>
              <div className={cn('text-sm font-medium', statusCfg.color)}>
                {statusCfg.label}
              </div>
              <div className="text-xs text-zinc-500">
                {error || statusCfg.description}
              </div>
            </div>
          </div>

          {/* Payment details card */}
          {session && !['creating', 'idle'].includes(uiStatus) && (
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 space-y-3">
              {/* Amount */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Amount</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-lg">
                    {session.displayAmount}
                  </span>
                  <span className="text-sm text-zinc-400 font-mono">
                    {session.tokenSymbol}
                  </span>
                  <span className="text-xs text-zinc-600">
                    ({session.chainName})
                  </span>
                </div>
              </div>

              {/* Treasury address */}
              <div>
                <div className="text-xs text-zinc-500 mb-1">Send to (treasury)</div>
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2">
                  <code className="text-xs text-zinc-200 font-mono flex-1 truncate">
                    {session.treasuryAddress}
                  </code>
                  <CopyButton text={session.treasuryAddress} />
                </div>
              </div>

              {/* Token address (if ERC-20) */}
              {session.tokenAddress && (
                <div>
                  <div className="text-xs text-zinc-500 mb-1">
                    Token contract ({session.tokenSymbol})
                  </div>
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2">
                    <code className="text-xs text-zinc-400 font-mono flex-1 truncate">
                      {session.tokenAddress}
                    </code>
                    <CopyButton text={session.tokenAddress} />
                  </div>
                </div>
              )}

              {/* Expiry */}
              {!isTerminal && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Expires in</span>
                  <ExpiryTimer expiresAt={session.expiresAt} />
                </div>
              )}

              {/* Confirmation progress */}
              {session.blockchainPayment && (
                <ConfirmationBar
                  current={session.blockchainPayment.confirmations}
                  required={session.blockchainPayment.requiredConfirmations}
                />
              )}

              {/* Tx hash (after user sends) */}
              {userTxHash && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Your tx</span>
                  <a
                    href={`https://etherscan.io/tx/${userTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-violet-400 hover:text-violet-300 font-mono"
                  >
                    {userTxHash.slice(0, 10)}…
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Detected tx hash */}
              {session.blockchainPayment?.txHash && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Detected tx</span>
                  <span className="font-mono text-zinc-300">
                    {session.blockchainPayment.txHash.slice(0, 14)}…
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Loading skeleton */}
          {['idle', 'creating'].includes(uiStatus) && (
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-4 bg-zinc-700 rounded w-3/4" />
              <div className="h-8 bg-zinc-700 rounded" />
              <div className="h-4 bg-zinc-700 rounded w-1/2" />
            </div>
          )}

          {/* Warning: send from correct wallet */}
          {uiStatus === 'awaiting_payment' && session && (
            <div className="flex gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>
                You <strong>must send from</strong>{' '}
                <code className="font-mono">
                  {session.walletAddress.slice(0, 8)}…
                </code>
                . Payment from a different address will not be matched.
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2">
            {/* Send from wallet button */}
            {uiStatus === 'awaiting_payment' && (
              <button
                onClick={sendPayment}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                <Wallet className="h-4 w-4" />
                Send {session?.displayAmount} {session?.tokenSymbol} from Wallet
              </button>
            )}

            {['sending', 'tx_submitted'].includes(uiStatus) && (
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 bg-zinc-700 text-zinc-300 font-semibold py-3 rounded-xl cursor-wait"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                {uiStatus === 'sending' ? 'Waiting for wallet…' : 'Transaction broadcast…'}
              </button>
            )}

            {uiStatus === 'confirmed' && (
              <button
                onClick={onClose}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                <CheckCircle className="h-4 w-4" />
                Done
              </button>
            )}

            {(uiStatus === 'expired' || uiStatus === 'error') && (
              <button
                onClick={() => {
                  reset();
                  createSession({ purpose, chainId });
                }}
                className="w-full flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                <ArrowRight className="h-4 w-4" />
                Try Again
              </button>
            )}
          </div>

          {/* Footer note */}
          <p className="text-center text-xs text-zinc-600">
            Payment is verified server-side via on-chain event detection.
            No manual confirmation needed.
          </p>
        </div>
      </div>
    </div>
  );
}
