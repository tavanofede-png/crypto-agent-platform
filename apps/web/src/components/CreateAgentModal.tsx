'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Bot,
  Loader2,
  AlertCircle,
  CheckCircle,
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
  { value: 'research', label: 'Research Agent',    description: 'Deep dives into crypto markets and DeFi protocols' },
  { value: 'trading',  label: 'Trading Assistant', description: 'Technical analysis and trade setups' },
  { value: 'coding',   label: 'Coding Agent',      description: 'Smart contract and dApp development' },
  { value: 'custom',   label: 'Custom',            description: 'Write your own SKILL.md from scratch' },
];

type OrderStatus = 'AWAITING_PAYMENT' | 'PAYMENT_DETECTED' | 'PAYMENT_CONFIRMED' | 'PROVISIONING' | 'COMPLETED' | 'FAILED';

interface OrderData {
  id: string;
  status: OrderStatus;
  agentName: string;
  agentId: string | null;
  failedReason: string | null;
}

interface Props {
  onClose:   () => void;
  onCreated: () => void;
}

// ─── Provisioning progress modal ──────────────────────────────────────────────

function ProvisioningModal({
  orderId,
  agentName,
  onSuccess,
  onClose,
}: {
  orderId:   string;
  agentName: string;
  onSuccess: (agentId: string) => void;
  onClose:   () => void;
}) {
  const [status, setStatus]   = useState<OrderStatus>('PAYMENT_CONFIRMED');
  const [failed, setFailed]   = useState<string | null>(null);
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const poll = useCallback(async () => {
    try {
      const data: OrderData = await agentOrdersApi.get(orderId);
      setStatus(data.status);
      if (data.status === 'COMPLETED' && data.agentId) {
        stopPolling();
        setTimeout(() => onSuccess(data.agentId!), 600);
      }
      if (data.status === 'FAILED') {
        stopPolling();
        setFailed(data.failedReason ?? 'Provisioning failed');
      }
    } catch { /* ignore transient */ }
  }, [orderId, onSuccess]);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 3000);
    return stopPolling;
  }, [poll]);

  const STEPS: { key: OrderStatus[]; label: string }[] = [
    { key: ['PAYMENT_CONFIRMED'],              label: 'Order confirmed' },
    { key: ['PROVISIONING'],                   label: 'Creating workspace…' },
    { key: ['COMPLETED'],                      label: 'Agent ready!' },
  ];

  const currentIdx =
    status === 'COMPLETED'         ? 2 :
    status === 'PROVISIONING'      ? 1 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" />

      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Creating Agent</h2>
            <p className="text-xs text-zinc-500 truncate max-w-[200px]">{agentName}</p>
          </div>
          {failed && (
            <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {failed ? (
          <div className="flex gap-2 items-start bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl p-4">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{failed}</span>
          </div>
        ) : (
          <div className="space-y-3">
            {STEPS.map((step, i) => {
              const done    = i < currentIdx;
              const active  = i === currentIdx;
              return (
                <div key={i} className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border transition-all',
                  done   ? 'border-emerald-500/20 bg-emerald-500/5'  :
                  active ? 'border-violet-500/30 bg-violet-500/10'   :
                           'border-zinc-800 bg-zinc-800/30 opacity-40',
                )}>
                  <div className="flex-shrink-0">
                    {done ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : active ? (
                      <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-zinc-600" />
                    )}
                  </div>
                  <span className={cn(
                    'text-sm font-medium',
                    done ? 'text-emerald-300' : active ? 'text-violet-300' : 'text-zinc-500',
                  )}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function CreateAgentModal({ onClose, onCreated }: Props) {
  const router = useRouter();

  const [step, setStep]           = useState<'form' | 'provisioning'>('form');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [orderId, setOrderId]     = useState<string | null>(null);
  const [agentName, setAgentName] = useState('');

  const [form, setForm] = useState({
    name:          '',
    description:   '',
    framework:     'ZEROCLAW',
    model:         'gpt-4o',
    skillTemplate: 'research',
    customSkill:   '',
    temperature:   0.7,
    maxTokens:     2048,
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
      setAgentName(form.name);
      setStep('provisioning');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  const handleSuccess = (agentId: string) => {
    onCreated();
    router.push(`/agents/${agentId}`);
  };

  // ── Provisioning progress view ─────────────────────────────

  if (step === 'provisioning' && orderId) {
    return (
      <ProvisioningModal
        orderId={orderId}
        agentName={agentName}
        onSuccess={handleSuccess}
        onClose={onClose}
      />
    );
  }

  // ── Form view ──────────────────────────────────────────────

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
              <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
            ) : (
              <><Bot className="h-4 w-4" /> Create Agent</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
