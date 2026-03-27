'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Settings, ArrowLeft, RotateCw, Loader2 } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { ChatInterface } from '@/components/ChatInterface';
import { agentsApi } from '@/lib/api';
import { useStore } from '@/store/useStore';
import type { Agent } from '@/store/useStore';
import { AuthGuard } from '@/components/AuthGuard';

const STATUS_COLORS: Record<string, string> = {
  RUNNING: 'bg-emerald-400',
  PROVISIONING: 'bg-amber-400 animate-pulse',
  STOPPED: 'bg-zinc-500',
  ERROR: 'bg-red-400',
};

function AgentChatContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    loadAgent();
  }, [id]);

  // Poll agent status while provisioning
  useEffect(() => {
    if (!agent || agent.status !== 'PROVISIONING') return;

    const poll = setInterval(() => loadAgent(), 3000);
    return () => clearInterval(poll);
  }, [agent?.status]);

  const loadAgent = async () => {
    try {
      const data = await agentsApi.get(id);
      setAgent(data);
    } catch {
      router.replace('/agents');
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!agent) return;
    setRestarting(true);
    try {
      await agentsApi.restart(id);
      setAgent((a) => a ? { ...a, status: 'PROVISIONING' } : a);
    } finally {
      setRestarting(false);
    }
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

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <Navbar />

      {/* Sub-header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/agents"
              className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status] ?? 'bg-zinc-500'}`}
              />
              <span className="text-sm font-medium text-white">{agent.name}</span>
              <span className="text-xs text-zinc-600 font-mono">{agent.model}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRestart}
              disabled={restarting || agent.status === 'PROVISIONING'}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <RotateCw className={`h-3.5 w-3.5 ${restarting ? 'animate-spin' : ''}`} />
              Restart
            </button>

            <Link
              href={`/agents/${id}/settings`}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Link>
          </div>
        </div>
      </div>

      {/* Chat fills remaining height */}
      <div className="flex-1 max-w-4xl w-full mx-auto flex flex-col" style={{ height: 'calc(100vh - 112px)' }}>
        <ChatInterface
          agentId={agent.id}
          agentName={agent.name}
          agentStatus={agent.status}
        />
      </div>
    </div>
  );
}

export default function AgentChatPage() {
  return <AuthGuard><AgentChatContent /></AuthGuard>;
}
