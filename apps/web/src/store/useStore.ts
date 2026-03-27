'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  walletAddress: string;
  credits: number;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  framework: string;
  model: string;
  status: 'PROVISIONING' | 'RUNNING' | 'STOPPED' | 'ERROR' | 'DELETED';
  skill?: { content: string; template?: string };
  createdAt: string;
  _count?: { chatSessions: number };
}

interface AppState {
  user: User | null;
  token: string | null;
  agents: Agent[];
  isAuthenticated: boolean;

  setAuth: (user: User, token: string) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;

  setAgents: (agents: Agent[]) => void;
  upsertAgent: (agent: Agent) => void;
  removeAgent: (id: string) => void;
  updateAgentStatus: (id: string, status: Agent['status']) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      agents: [],
      isAuthenticated: false,

      setAuth: (user, token) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('cap_token', token);
        }
        set({ user, token, isAuthenticated: true });
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('cap_token');
          localStorage.removeItem('cap_user');
        }
        set({ user: null, token: null, agents: [], isAuthenticated: false });
      },

      setAgents: (agents) => set({ agents }),

      upsertAgent: (agent) =>
        set((state) => {
          const exists = state.agents.findIndex((a) => a.id === agent.id);
          if (exists >= 0) {
            const updated = [...state.agents];
            updated[exists] = agent;
            return { agents: updated };
          }
          return { agents: [agent, ...state.agents] };
        }),

      removeAgent: (id) =>
        set((state) => ({ agents: state.agents.filter((a) => a.id !== id) })),

      updateAgentStatus: (id, status) =>
        set((state) => ({
          agents: state.agents.map((a) => (a.id === id ? { ...a, status } : a)),
        })),
    }),
    {
      name: 'cap-store',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
