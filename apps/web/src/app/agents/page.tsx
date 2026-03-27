'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Bot, Coins, Loader2, CreditCard } from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { AgentCard } from '@/components/AgentCard';
import { CreateAgentModal } from '@/components/CreateAgentModal';
import { agentsApi, paymentsApi } from '@/lib/api';
import { useStore } from '@/store/useStore';

export default function AgentsPage() {
  const router = useRouter();
  const { isAuthenticated, agents, setAgents, removeAgent, updateAgentStatus, user, updateUser } =
    useStore();

  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [mockPaymentLoading, setMockPaymentLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/connect');
      return;
    }
    loadAgents();
  }, [isAuthenticated]);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await agentsApi.list();
      setAgents(data);
    } catch (err) {
      console.error('Failed to load agents', err);
    } finally {
      setLoading(false);
    }
  }, [setAgents]);

  const handleRestart = async (id: string) => {
    updateAgentStatus(id, 'PROVISIONING');
    try {
      await agentsApi.restart(id);
    } catch {
      updateAgentStatus(id, 'ERROR');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this agent? This cannot be undone.')) return;
    removeAgent(id);
    try {
      await agentsApi.delete(id);
    } catch {
      loadAgents();
    }
  };

  const handleMockPayment = async () => {
    setMockPaymentLoading(true);
    try {
      const result = await paymentsApi.mockConfirm(10);
      updateUser({ credits: (user?.credits ?? 0) + result.creditsAwarded });
      alert(`+${result.creditsAwarded} credits added!`);
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Failed to add credits');
    } finally {
      setMockPaymentLoading(false);
    }
  };

  const handleCreated = () => {
    setShowCreate(false);
    loadAgents();
  };

  const visibleAgents = agents.filter((a) => a.status !== 'DELETED');

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">My Agents</h1>
            <p className="text-zinc-500 text-sm mt-1">
              {visibleAgents.length} agent{visibleAgents.length !== 1 ? 's' : ''} total
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Mock payment button for dev */}
            {process.env.NODE_ENV !== 'production' && (
              <button
                onClick={handleMockPayment}
                disabled={mockPaymentLoading}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
              >
                {mockPaymentLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4 text-amber-400" />
                )}
                Add 1000 Credits
              </button>
            )}

            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-all hover:shadow-lg hover:shadow-violet-600/20"
            >
              <Plus className="h-4 w-4" />
              New Agent
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
          </div>
        ) : visibleAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-6">
              <Bot className="h-10 w-10 text-violet-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">No agents yet</h2>
            <p className="text-zinc-500 text-sm max-w-sm mb-8">
              Create your first AI agent powered by ZeroClaw or OpenClaw with custom skills
            </p>

            {(user?.credits ?? 0) < 50 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 text-amber-400 text-sm">
                  <Coins className="h-4 w-4" />
                  <span>You need 50+ credits to create an agent</span>
                </div>
                <button
                  onClick={handleMockPayment}
                  className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white font-medium px-5 py-2.5 rounded-xl transition-colors"
                >
                  <CreditCard className="h-4 w-4 text-amber-400" />
                  Get Credits (Demo)
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
              >
                <Plus className="h-4 w-4" />
                Create First Agent
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onRestart={handleRestart}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateAgentModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
