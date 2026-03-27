import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// ─── Request interceptor — attach access token ────────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('cap_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor — transparent token refresh ─────────────────────────
// When the API returns 401, attempt a silent refresh using the refresh token.
// If the refresh fails, the session is cleared and the page is redirected.

let isRefreshing = false;
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

function drainQueue(token: string | null, err: any) {
  pendingQueue.forEach((p) => (token ? p.resolve(token) : p.reject(err)));
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;

    if (err.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }

    original._retry = true;

    if (isRefreshing) {
      // Another request already started a refresh — queue this one.
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    isRefreshing = true;

    try {
      const refreshToken = localStorage.getItem('cap_refresh_token');
      if (!refreshToken) throw new Error('No refresh token available');

      // Use a bare fetch to avoid triggering the interceptor on the refresh call.
      const resp = await fetch(`${API_URL}/api/auth/refresh`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken }),
      });

      if (!resp.ok) throw new Error('Refresh failed');

      const data = await resp.json();
      const newToken: string = data.accessToken;

      localStorage.setItem('cap_token', newToken);
      if (typeof document !== 'undefined') {
        document.cookie = `cap_access_token=${newToken}; path=/; SameSite=Lax; max-age=3600`;
      }

      drainQueue(newToken, null);
      original.headers.Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      drainQueue(null, refreshErr);
      // Clear session and signal the auth listener.
      localStorage.removeItem('cap_token');
      localStorage.removeItem('cap_refresh_token');
      if (typeof document !== 'undefined') {
        document.cookie = 'cap_access_token=; path=/; max-age=0';
      }
      window.dispatchEvent(new Event('auth:logout'));
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  },
);

// ─── Auth endpoints ───────────────────────────────────────────────────────────

export const authApi = {
  /**
   * POST /api/auth/nonce
   * Returns the exact message the wallet must sign, plus the nonce UUID.
   */
  requestNonce: (walletAddress: string) =>
    api
      .post<{ nonce: string; message: string; expiresAt: string }>(
        '/auth/nonce',
        { walletAddress },
      )
      .then((r) => r.data),

  /**
   * POST /api/auth/verify
   * Verifies the ECDSA signature.  Returns access + refresh tokens.
   */
  verify: (data: {
    walletAddress: string;
    nonce:         string;
    message:       string;
    signature:     string;
  }) =>
    api
      .post<{
        accessToken:  string;
        refreshToken: string;
        user: { id: string; walletAddress: string };
      }>('/auth/verify', data)
      .then((r) => r.data),

  /** POST /api/auth/refresh */
  refresh: (refreshToken: string) =>
    api
      .post<{ accessToken: string; user: { id: string; walletAddress: string } }>(
        '/auth/refresh',
        { refreshToken },
      )
      .then((r) => r.data),

  /** POST /api/auth/logout */
  logout: () => api.post('/auth/logout').then((r) => r.data),

  /** GET /api/auth/me */
  me: () => api.get('/auth/me').then((r) => r.data),
};

// ─── Agent endpoints ──────────────────────────────────────────────────────────

export const agentsApi = {
  list:               ()                       => api.get('/agents').then((r) => r.data),
  get:                (id: string)             => api.get(`/agents/${id}`).then((r) => r.data),
  update:             (id: string, data: any)  => api.put(`/agents/${id}`, data).then((r) => r.data),
  delete:             (id: string)             => api.delete(`/agents/${id}`).then((r) => r.data),
  restart:            (id: string)             => api.post(`/agents/${id}/restart`).then((r) => r.data),
  getLogs:            (id: string, limit = 50) => api.get(`/agents/${id}/logs?limit=${limit}`).then((r) => r.data),
  getSessions:        (id: string)             => api.get(`/agents/${id}/sessions`).then((r) => r.data),
  getSessionMessages: (sessionId: string)      => api.get(`/agents/sessions/${sessionId}/messages`).then((r) => r.data),
};

// ─── Agent creation orders ────────────────────────────────────────────────────

export interface CreateOrderForm {
  name:          string;
  description?:  string;
  framework:     string;
  model:         string;
  skillTemplate: string;
  customSkill?:  string;
  temperature?:  number;
  maxTokens?:    number;
}

export const agentOrdersApi = {
  create:  (data: CreateOrderForm) => api.post('/agent-orders', data).then((r) => r.data),
  get:     (id: string)            => api.get(`/agent-orders/${id}`).then((r) => r.data),
  list:    ()                      => api.get('/agent-orders').then((r) => r.data),
  mockPay: (id: string)            => api.post(`/agent-orders/${id}/mock-pay`).then((r) => r.data),
};

// ─── Payments ─────────────────────────────────────────────────────────────────

export const paymentsApi = {
  info: () => api.get('/payments/info').then((r) => r.data),
};
