import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Attach JWT from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('cap_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('cap_token');
      localStorage.removeItem('cap_user');
      window.dispatchEvent(new Event('auth:logout'));
    }
    return Promise.reject(err);
  },
);

// ─── Auth ──────────────────────────────────────────────────
export const authApi = {
  getNonce: (address: string) =>
    api.get<{ nonce: string }>(`/auth/nonce/${address}`).then((r) => r.data),
  verify: (walletAddress: string, signature: string) =>
    api
      .post<{ accessToken: string; user: { id: string; walletAddress: string; credits: number } }>(
        '/auth/verify',
        { walletAddress, signature },
      )
      .then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

// ─── Agents ────────────────────────────────────────────────
export const agentsApi = {
  list: () => api.get('/agents').then((r) => r.data),
  get: (id: string) => api.get(`/agents/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/agents', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/agents/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/agents/${id}`).then((r) => r.data),
  restart: (id: string) => api.post(`/agents/${id}/restart`).then((r) => r.data),
  getLogs: (id: string, limit = 50) =>
    api.get(`/agents/${id}/logs?limit=${limit}`).then((r) => r.data),
  getSessions: (id: string) => api.get(`/agents/${id}/sessions`).then((r) => r.data),
  getSessionMessages: (sessionId: string) =>
    api.get(`/agents/sessions/${sessionId}/messages`).then((r) => r.data),
};

// ─── Payments ──────────────────────────────────────────────
export const paymentsApi = {
  info: () => api.get('/payments/info').then((r) => r.data),
  initiate: (data: any) => api.post('/payments/initiate', data).then((r) => r.data),
  confirm: (txHash: string, walletAddress: string) =>
    api.post('/payments/confirm', { txHash, walletAddress }).then((r) => r.data),
  mockConfirm: (amount: number) =>
    api.post('/payments/mock-confirm', { amount }).then((r) => r.data),
  transactions: () => api.get('/payments/transactions').then((r) => r.data),
};
