'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  walletAddress: string;
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
  user:            User | null;
  token:           string | null;
  refreshToken:    string | null;
  agents:          Agent[];
  isAuthenticated: boolean;

  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  updateAccessToken: (accessToken: string) => void;
  logout: () => void;

  setAgents: (agents: Agent[]) => void;
  upsertAgent: (agent: Agent) => void;
  removeAgent: (id: string) => void;
  updateAgentStatus: (id: string, status: Agent['status']) => void;
}

// ─── Cookie helpers (client-side only) ────────────────────────────────────────
// The access token is also stored in a JS-accessible cookie so that
// Next.js middleware can read it for server-side route protection.
// NOTE: not httpOnly — this is the MVP tradeoff for an SPA architecture.
// A future improvement would use a backend-issued httpOnly refresh cookie.

function setAuthCookie(token: string, maxAgeSeconds = 3600) {
  if (typeof document !== 'undefined') {
    document.cookie = `cap_access_token=${token}; path=/; SameSite=Lax; max-age=${maxAgeSeconds}`;
  }
}

function clearAuthCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = 'cap_access_token=; path=/; max-age=0';
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user:            null,
      token:           null,
      refreshToken:    null,
      agents:          [],
      isAuthenticated: false,

      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem('cap_token', accessToken);
        localStorage.setItem('cap_refresh_token', refreshToken);
        setAuthCookie(accessToken);
        set({ user, token: accessToken, refreshToken, isAuthenticated: true });
      },

      updateAccessToken: (accessToken) => {
        localStorage.setItem('cap_token', accessToken);
        setAuthCookie(accessToken);
        set({ token: accessToken });
      },

      logout: () => {
        localStorage.removeItem('cap_token');
        localStorage.removeItem('cap_refresh_token');
        clearAuthCookie();
        set({ user: null, token: null, refreshToken: null, agents: [], isAuthenticated: false });
      },

      setAgents: (agents) => set({ agents }),

      upsertAgent: (agent) =>
        set((state) => {
          const idx = state.agents.findIndex((a) => a.id === agent.id);
          if (idx >= 0) {
            const updated = [...state.agents];
            updated[idx] = agent;
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
        user:            state.user,
        token:           state.token,
        refreshToken:    state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      // Re-sync the cookie whenever the persisted state is rehydrated (page reload).
      onRehydrateStorage: () => (state) => {
        if (state?.token) setAuthCookie(state.token);
      },
    },
  ),
);
