'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Bot,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  ShieldCheck,
  Copy,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import { agentOrdersApi } from '@/lib/api';
import { cn } from '@repo/ui';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODELS = [
  { value: 'gpt-4o',                      label: 'GPT-4o (OpenAI)' },
  { value: 'gpt-4o-mini',                 label: 'GPT-4o Mini (OpenAI)' },
  { value: 'claude-3-5-sonnet-20241022',  label: 'Claude 3.5 Sonnet (Anthropic)' },
  { value: 'claude-3-haiku-20240307',     label: 'Claude 3 Haiku (Anthropic)' },
];

const SKILL_TEMPLATES = [
  { value: 'research', label: 'Research Agent',      description: 'Deep dives into crypto markets and DeFi protocols' },
  { value: 'trading',  label: 'Trading Assistant',   description: 'Technical analysis and trade setups' },
  { value: 'coding',   label: 'Coding Agent',        description: 'Smart contract and dApp development' },
  { value: 'custom',   label: 'Custom',              description: 'Write your own SKILL.md from scratch' },
];

const EXPLORER_TX_URL: Record<number, string> = {
  1:        'https://etherscan.io/tx/',
  137:      'https://polygonscan.com/tx/',
  42161:    'https://arbiscan.io/tx/',
  8453:     'https://basescan.org/tx/',
  10:       'https://optimistic.etherscan.io/tx/',
  11155111: 'https://sepolia.etherscan.io/tx/',
  80002:    'https://amoy.polygonscan.com/tx/',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus =
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_DETECTED'
  | 'PAYMENT_CONFIRMED'
  | 'PROVISIONING'
  | 'COMPLETED'
  | 'FAILED';

interface OrderData {
  id: string;
  status: OrderStatus;
  agentName: string;
  priceAmount: string;
  priceToken: string;
  priceChainId: number;
  agentId: string | null;
  txHash: string | null;
  failedReason: string | null;
  treasuryAddress: string;
  paymentSession?: {
    id: string;
    status: string;
    walletAddress: string;
    chainId: number;
    tokenAddress: string | null;
    tokenSymbol: string;
    displayAmount: string;
    expiresAt: string;
    treasuryAddress: string;
    blockchainPayment?: {
      txHash: string;
      confirmations: number;
      requiredConfirmations: number;
    } | null;
  } | null;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

// ─── CopyButton helper ────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
    >
      {copied ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ─── ExpiryTimer helper ───────────────────────────────────────────────────────

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
  const urgent = new Date(expiresAt).getTime() - Date.now() < 3 * 60_000;
  return <span className={cn('font-mono text-xs', urgent ? 'text-red-400' : 'text-zinc-500')}>{remaining}</span>;
}

// ─── Payment status config ────────────────────────────────────────────────────

const STATUS_LABELS: Record<OrderStatus, { label: string; desc: string; color: string; icon: React.ReactNode }> = {
  AWAITING_PAYMENT:  { label: 'Waiting for payment',      desc: 'Send the exact amount to the address below', color: 'text-amber-400',   icon: <Clock className="h-5 w-5" /> },
  PAYMENT_DETECTED:  { label: 'Payment detected',         desc: 'Transaction found on-chain — collecting confirmations', color: 'text-blue-400', icon: <ShieldCheck className="h-5 w-5 animate-pulse" /> },
  PAYMENT_CONFIRMED: { label: 'Payment confirmed',        desc: 'Setting up your agent workspace…',           color: 'text-blue-400',   icon: <Loader2 className="h-5 w-5 animate-spin" /> },
  PROVISIONING:      { label: 'Provisioning agent…',      desc: 'Creating workspace and loading SKILL.md',    color: 'text-violet-400', icon: <Loader2 className="h-5 w-5 animate-spin" /> },
  COMPLETED:         { label: 'Agent is ready!',          desc: 'Redirecting to your new agent…',             color: 'text-emerald-400',icon: <CheckCircle className="h-5 w-5" /> },
  FAILED:            { label: 'Something went wrong',     desc: '',                                           color: 'text-red-400',    icon: <AlertCircle className="h-5 w-5" /> },
};

// ─── AgentPaymentModal ────────────────────────────────────────────────────────

function AgentPaymentModal({
  orderId,
  initialOrder,
  onSuccess,
  onClose,
}: {
  orderId: string;
  initialOrder: OrderData;
  onSuccess: (agentId: string) => void;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<OrderData>(initialOrder);
  const [mockLoading, setMockLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const poll = useCallback(async () => {
    try {
      const data: OrderData = await agentOrdersApi.get(orderId);
      setOrder(data);
      if (data.status === 'COMPLETED' && data.agentId) {
        stopPolling();
        setTimeout(() => onSuccess(data.agentId!), 800);
      }
      if (data.status === 'FAILED') stopPolling();
    } catch { /* ignore transient fetch errors */ }
  }, [orderId, onSuccess]);

  useEffect(() => {
    pollRef.current = setInterval(poll, 4000);
    return stopPolling;
  }, [poll]);

  const handleMockPay = async () => {
    setMockLoading(true);
    try {
      await agentOrdersApi.mockPay(orderId);
      await poll();
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Mock pay failed');
    } finally {
      setMockLoading(false);
    }
  };

  const cfg     = STATUS_LABELS[order.status];
  const session = order.paymentSession;
  const isTerminal = order.status === 'COMPLETED' || order.status === 'FAILED';
  const isDev   = process.env.NODE_ENV !== 'production';
  const treasury = session?.treasuryAddress ?? order.treasuryAddress;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={isTerminal ? onClose : undefined} />

      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-semibold text-white">Create Agent</h2>
            <p className="text-xs text-zinc-500 truncate max-w-[220px]">{order.agentName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Status banner */}
          <div className={cn(
            'flex items-center gap-3 p-3 rounded-xl border',
            order.status === 'COMPLETED'  ? 'bg-emerald-500/10 border-emerald-500/20' :
            order.status === 'FAILED'     ? 'bg-red-500/10 border-red-500/20' :
                                            'bg-zinc-800/60 border-zinc-700/60',
          )}>
            <span className={cfg.color}>{cfg.icon}</span>
            <div>
              <div className={cn('text-sm font-medium', cfg.color)}>{cfg.label}</div>
              <div className="text-xs text-zinc-500">
                {order.status === 'FAILED' ? order.failedReason : cfg.desc}
              </div>
            </div>
          </div>

          {/* Payment details card */}
          {order.status === 'AWAITING_PAYMENT' && session && (
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 space-y-3">
              {/* Amount */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Amount</span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-lg">{order.priceAmount}</span>
                  <span className="text-sm text-zinc-400 font-mono">{order.priceToken}</span>
                </div>
              </div>

              {/* Treasury */}
              <div>
                <div className="text-xs text-zinc-500 mb-1">Send to</div>
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2">
                  <code className="text-xs text-zinc-200 font-mono flex-1 truncate">{treasury}</code>
                  <CopyButton text={treasury} />
                </div>
              </div>

              {/* From wallet */}
              <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                Must send from: <code className="font-mono">{session.walletAddress.slice(0, 10)}…{session.walletAddress.slice(-4)}</code>
              </div>

              {/* Expiry */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Expires in</span>
                <ExpiryTimer expiresAt={session.expiresAt} />
              </div>
            </div>
          )}

          {/* Confirmation progress */}
          {(order.status === 'PAYMENT_DETECTED') && session?.blockchainPayment && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Confirmations</span>
                <span className="font-mono">{session.blockchainPayment.confirmations} / {session.blockchainPayment.requiredConfirmations}</span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-600 to-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((session.blockchainPayment.confirmations / session.blockchainPayment.requiredConfirmations) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Tx hash link */}
          {order.txHash && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Transaction</span>
              <a
                href={`${EXPLORER_TX_URL[order.priceChainId] ?? 'https://etherscan.io/tx/'}${order.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-violet-400 hover:text-violet-300 font-mono"
              >
                {order.txHash.slice(0, 12)}…<ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* Dev mock pay button */}
          {isDev && order.status === 'AWAITING_PAYMENT' && (
            <button
              onClick={handleMockPay}
              disabled={mockLoading}
              className="w-full flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 text-sm font-medium py-2.5 rounded-xl transition-colors border border-dashed border-zinc-600"
            >
              {mockLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Skip Payment (dev mode)
            </button>
          )}

          {/* Retry on failure */}
          {order.status === 'FAILED' && (
            <button
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 bg-zinc-700 hover:bg-zinc-600 text-white font-medium py-3 rounded-xl transition-colors"
            >
              Close and try again
            </button>
          )}

          <p className="text-center text-xs text-zinc-600">
            Payment is verified server-side. No manual confirmation needed.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main CreateAgentModal ────────────────────────────────────────────────────

export function CreateAgentModal({ onClose, onCreated }: Props) {
  const router = useRouter();

  const [step, setStep]       = useState<'form' | 'payment'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderData, setOrderData] = useState<OrderData | null>(null);

  const [form, setForm] = useState({
    name:         '',
    description:  '',
    framework:    'ZEROCLAW',
    model:        'gpt-4o',
    skillTemplate:'research',
    customSkill:  '',
    temperature:  0.7,
    maxTokens:    2048,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const order: OrderData = await agentOrdersApi.create({
        name:          form.name,
        description:   form.description || undefined,
        framework:     form.framework,
        model:         form.model,
        skillTemplate: form.skillTemplate,
        customSkill:   form.skillTemplate === 'custom' ? form.customSkill : undefined,
        temperature:   form.temperature,
        maxTokens:     form.maxTokens,
      });
      setOrderId(order.id);
      setOrderData(order);
      setStep('payment');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create order');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = (agentId: string) => {
    onCreated();
    router.push(`/agents/${agentId}`);
  };

  // ── Payment step ───────────────────────────────────────────

  if (step === 'payment' && orderId && orderData) {
    return (
      <AgentPaymentModal
        orderId={orderId}
        initialOrder={orderData}
        onSuccess={handleSuccess}
        onClose={onClose}
      />
    );
  }

  // ── Form step ──────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-400" />
            <h2 className="font-semibold text-white">Create Agent</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Agent Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text" required minLength={2} maxLength={60}
              placeholder="My Research Bot"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <input
              type="text" maxLength={200}
              placeholder="What does this agent do?"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
            />
          </div>

          {/* Framework */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Framework</label>
            <div className="grid grid-cols-2 gap-2">
              {['ZEROCLAW', 'OPENCLAW'].map((fw) => (
                <button
                  key={fw} type="button"
                  onClick={() => setForm((f) => ({ ...f, framework: fw }))}
                  className={cn(
                    'p-3 rounded-lg border text-sm font-medium transition-all',
                    form.framework === fw
                      ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600',
                  )}
                >
                  {fw === 'ZEROCLAW' ? 'ZeroClaw' : 'OpenClaw'}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Model</label>
            <select
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
            >
              {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {/* Skill template */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Skill Template</label>
            <div className="space-y-2">
              {SKILL_TEMPLATES.map((t) => (
                <button
                  key={t.value} type="button"
                  onClick={() => setForm((f) => ({ ...f, skillTemplate: t.value }))}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border transition-all',
                    form.skillTemplate === t.value
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600',
                  )}
                >
                  <div className="text-sm font-medium text-white">{t.label}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          {form.skillTemplate === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">SKILL.md Content</label>
              <textarea
                rows={8}
                placeholder="# My Custom Agent&#10;&#10;## Identity&#10;You are..."
                value={form.customSkill}
                onChange={(e) => setForm((f) => ({ ...f, customSkill: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors font-mono resize-none"
              />
            </div>
          )}

          {/* Advanced */}
          <details className="group">
            <summary className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-200 list-none flex items-center gap-1">
              Advanced Settings <span className="text-zinc-600 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Temperature ({form.temperature})</label>
                <input
                  type="range" min="0" max="2" step="0.1"
                  value={form.temperature}
                  onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
                  className="w-full accent-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Max Tokens</label>
                <input
                  type="number" min={256} max={32768} step={256}
                  value={form.maxTokens}
                  onChange={(e) => setForm((f) => ({ ...f, maxTokens: parseInt(e.target.value) }))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500"
                />
              </div>
            </div>
          </details>

          {error && (
            <div className="flex gap-2 items-start bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !form.name.trim()}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Preparing…</>
            ) : (
              <><Bot className="h-4 w-4" /> Continue to Payment</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
