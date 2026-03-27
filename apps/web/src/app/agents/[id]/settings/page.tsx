'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Trash2,
  RotateCw,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { SkillEditor } from '@/components/SkillEditor';
import { agentsApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import type { Agent } from '@/store/useStore';

interface AgentLog {
  id: string;
  level: string;
  message: string;
  createdAt: string;
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-zinc-500',
  INFO: 'text-blue-400',
  WARN: 'text-amber-400',
  ERROR: 'text-red-400',
};

export default function AgentSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAuthenticated, removeAgent } = useStore();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'skill' | 'logs' | 'settings'>('skill');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', model: '', temperature: 0.7 });

  useEffect(() => {
    if (!isAuthenticated) { router.replace('/connect'); return; }
    loadData();
  }, [isAuthenticated, id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [agentData, logsData] = await Promise.all([
        agentsApi.get(id),
        agentsApi.getLogs(id, 100),
      ]);
      setAgent(agentData);
      setLogs(logsData);
      setForm({
        name: agentData.name,
        description: agentData.description ?? '',
        model: agentData.model,
        temperature: agentData.temperature,
      });
    } catch {
      router.replace('/agents');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const updated = await agentsApi.update(id, form);
      setAgent(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${agent?.name}"? This is permanent.`)) return;
    await agentsApi.delete(id);
    removeAgent(id);
    router.push('/agents');
  };

  const handleRestart = async () => {
    await agentsApi.restart(id);
    setAgent((a) => a ? { ...a, status: 'PROVISIONING' } : a);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
        </div>
      </div>
    );
  }

  if (!agent) return null;

  const TABS = [
    { key: 'skill', label: 'SKILL.md' },
    { key: 'logs', label: `Logs (${logs.length})` },
    { key: 'settings', label: 'Settings' },
  ] as const;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <Navbar />

      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href={`/agents/${id}`} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm text-zinc-400">
            {agent.name} · <span className="text-zinc-600">Settings</span>
          </span>
        </div>
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-800 mb-6">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? 'border-violet-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* SKILL.md Editor */}
        {activeTab === 'skill' && (
          <div className="h-[600px]">
            <SkillEditor
              agentId={id}
              initialContent={agent.skill?.content ?? ''}
            />
          </div>
        )}

        {/* Logs */}
        {activeTab === 'logs' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <span className="text-sm font-medium text-white">Agent Logs</span>
              <button onClick={loadData} className="text-xs text-zinc-500 hover:text-white flex items-center gap-1">
                <RotateCw className="h-3 w-3" /> Refresh
              </button>
            </div>
            <div className="overflow-y-auto max-h-[550px] font-mono text-xs scrollbar-thin">
              {logs.length === 0 ? (
                <div className="text-center text-zinc-600 py-12">No logs yet</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex gap-3 px-4 py-2 hover:bg-zinc-800/40 border-b border-zinc-800/40">
                    <span className="text-zinc-600 flex-shrink-0 w-36">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    <span className={`flex-shrink-0 w-12 ${LOG_LEVEL_COLORS[log.level] ?? 'text-zinc-400'}`}>
                      {log.level}
                    </span>
                    <span className="text-zinc-300 break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* General Settings */}
        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-lg">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-white">General</h3>

              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-lg px-3 py-2.5 text-sm text-white outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">
                  Temperature ({form.temperature})
                </label>
                <input
                  type="range"
                  min="0" max="2" step="0.1"
                  value={form.temperature}
                  onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) }))}
                  className="w-full accent-violet-500"
                />
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Changes
              </button>
            </div>

            {/* Danger zone */}
            <div className="bg-zinc-900 border border-red-500/20 rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Danger Zone
              </h3>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white">Restart Agent</div>
                  <div className="text-xs text-zinc-500">Re-provision the agent workspace</div>
                </div>
                <button
                  onClick={handleRestart}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-amber-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <RotateCw className="h-4 w-4" />
                  Restart
                </button>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <div>
                  <div className="text-sm text-white">Delete Agent</div>
                  <div className="text-xs text-zinc-500">This will permanently delete the agent and all chat history</div>
                </div>
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
