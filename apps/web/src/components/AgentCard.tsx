'use client';

import Link from 'next/link';
import { MessageSquare, Settings, RotateCw, Trash2, Bot } from 'lucide-react';
import { cn } from '@repo/ui';
import type { Agent } from '@/store/useStore';

const STATUS_CONFIG: Record<
  Agent['status'],
  { label: string; dot: string; badge: string }
> = {
  RUNNING: {
    label: 'Running',
    dot: 'bg-emerald-400 animate-pulse',
    badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  },
  PROVISIONING: {
    label: 'Starting…',
    dot: 'bg-amber-400 animate-pulse',
    badge: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  },
  STOPPED: {
    label: 'Stopped',
    dot: 'bg-zinc-500',
    badge: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  },
  ERROR: {
    label: 'Error',
    dot: 'bg-red-400',
    badge: 'text-red-400 bg-red-500/10 border-red-500/20',
  },
  DELETED: {
    label: 'Deleted',
    dot: 'bg-zinc-700',
    badge: 'text-zinc-600 bg-zinc-900 border-zinc-800',
  },
};

const FRAMEWORK_LABELS: Record<string, string> = {
  ZEROCLAW: 'ZeroClaw',
  OPENCLAW: 'OpenClaw',
};

interface AgentCardProps {
  agent: Agent;
  onRestart: (id: string) => void;
  onDelete: (id: string) => void;
}

export function AgentCard({ agent, onRestart, onDelete }: AgentCardProps) {
  const statusCfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.STOPPED;

  return (
    <div className="group bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition-all hover:shadow-lg hover:shadow-zinc-900/50 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
            <Bot className="h-5 w-5 text-violet-400" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-white truncate">{agent.name}</h3>
            {agent.description && (
              <p className="text-xs text-zinc-500 truncate">{agent.description}</p>
            )}
          </div>
        </div>

        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border flex-shrink-0',
            statusCfg.badge,
          )}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full', statusCfg.dot)} />
          {statusCfg.label}
        </span>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-md">
          {FRAMEWORK_LABELS[agent.framework] ?? agent.framework}
        </span>
        <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded-md font-mono">
          {agent.model}
        </span>
        {agent._count && (
          <span className="text-xs text-zinc-600 flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {agent._count.chatSessions} sessions
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
        <Link
          href={`/agents/${agent.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
        </Link>

        <Link
          href={`/agents/${agent.id}/settings`}
          className="flex items-center justify-center w-9 h-9 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg transition-colors"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>

        <button
          onClick={() => onRestart(agent.id)}
          disabled={agent.status === 'PROVISIONING'}
          className="flex items-center justify-center w-9 h-9 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-amber-400 rounded-lg transition-colors disabled:opacity-40"
          title="Restart"
        >
          <RotateCw className="h-4 w-4" />
        </button>

        <button
          onClick={() => onDelete(agent.id)}
          className="flex items-center justify-center w-9 h-9 bg-zinc-800 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 rounded-lg transition-colors"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
