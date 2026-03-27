'use client';

import { useState } from 'react';
import { X, Bot, Loader2, AlertCircle } from 'lucide-react';
import { agentsApi } from '@/lib/api';
import { useStore } from '@/store/useStore';

const MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (OpenAI)' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Anthropic)' },
  { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Anthropic)' },
];

const SKILL_TEMPLATES = [
  {
    value: 'research',
    label: 'Research Agent',
    description: 'Deep dives into crypto markets and DeFi protocols',
  },
  {
    value: 'trading',
    label: 'Trading Assistant',
    description: 'Technical analysis and trade setups',
  },
  {
    value: 'coding',
    label: 'Coding Agent',
    description: 'Smart contract and dApp development',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Write your own SKILL.md from scratch',
  },
];

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateAgentModal({ onClose, onCreated }: Props) {
  const { user } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    framework: 'ZEROCLAW',
    model: 'gpt-4o',
    skillTemplate: 'research',
    customSkill: '',
    temperature: 0.7,
    maxTokens: 2048,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await agentsApi.create({
        name: form.name,
        description: form.description || undefined,
        framework: form.framework,
        model: form.model,
        skillTemplate: form.skillTemplate,
        customSkill: form.skillTemplate === 'custom' ? form.customSkill : undefined,
        temperature: form.temperature,
        maxTokens: form.maxTokens,
      });
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create agent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-violet-400" />
            <h2 className="font-semibold text-white">Create Agent</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Credits warning */}
        {user && user.credits < 50 && (
          <div className="mx-6 mt-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm rounded-lg px-4 py-3">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>
              You need at least 50 credits to create an agent. You have {user.credits}.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Agent Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={60}
              placeholder="My Research Bot"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Description
            </label>
            <input
              type="text"
              maxLength={200}
              placeholder="What does this agent do?"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors"
            />
          </div>

          {/* Framework */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Framework
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['ZEROCLAW', 'OPENCLAW'].map((fw) => (
                <button
                  key={fw}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, framework: fw }))}
                  className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                    form.framework === fw
                      ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {fw === 'ZEROCLAW' ? 'ZeroClaw' : 'OpenClaw'}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Model
            </label>
            <select
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Skill template */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Skill Template
            </label>
            <div className="space-y-2">
              {SKILL_TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, skillTemplate: t.value }))}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    form.skillTemplate === t.value
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-sm font-medium text-white">{t.label}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom skill editor */}
          {form.skillTemplate === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                SKILL.md Content
              </label>
              <textarea
                rows={8}
                placeholder="# My Custom Agent&#10;&#10;## Identity&#10;You are..."
                value={form.customSkill}
                onChange={(e) => setForm((f) => ({ ...f, customSkill: e.target.value }))}
                className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition-colors font-mono resize-none"
              />
            </div>
          )}

          {/* Advanced settings */}
          <details className="group">
            <summary className="text-sm text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors list-none flex items-center gap-1">
              <span>Advanced Settings</span>
              <span className="ml-1 text-zinc-600 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Temperature ({form.temperature})
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={form.temperature}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))
                  }
                  className="w-full accent-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Max Tokens
                </label>
                <input
                  type="number"
                  min={256}
                  max={32768}
                  step={256}
                  value={form.maxTokens}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, maxTokens: parseInt(e.target.value) }))
                  }
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white outline-none focus:border-violet-500 transition-colors"
                />
              </div>
            </div>
          </details>

          {/* Error */}
          {error && (
            <div className="flex gap-2 items-start bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !form.name.trim() || (user?.credits ?? 0) < 50}
            className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating Agent…
              </>
            ) : (
              <>
                <Bot className="h-4 w-4" />
                Create Agent (50 credits)
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
