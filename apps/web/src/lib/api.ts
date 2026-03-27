import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

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
      .post<{ accessToken: string; user: { id: string; walletAddress: string } }>(
        '/auth/verify',
        { walletAddress, signature },
      )
      .then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

// ─── Agents ────────────────────────────────────────────────
export const agentsApi = {
  list:              ()           => api.get('/agents').then((r) => r.data),
  get:               (id: string) => api.get(`/agents/${id}`).then((r) => r.data),
  update:            (id: string, data: any) => api.put(`/agents/${id}`, data).then((r) => r.data),
  delete:            (id: string) => api.delete(`/agents/${id}`).then((r) => r.data),
  restart:           (id: string) => api.post(`/agents/${id}/restart`).then((r) => r.data),
  getLogs:           (id: string, limit = 50) => api.get(`/agents/${id}/logs?limit=${limit}`).then((r) => r.data),
  getSessions:       (id: string) => api.get(`/agents/${id}/sessions`).then((r) => r.data),
  getSessionMessages:(sessionId: string) => api.get(`/agents/sessions/${sessionId}/messages`).then((r) => r.data),
};

// ─── Agent Creation Orders ─────────────────────────────────
export interface CreateOrderForm {
  name:         string;
  description?: string;
  framework:    string;
  model:        string;
  skillTemplate:string;
  customSkill?: string;
  temperature?: number;
  maxTokens?:   number;
}

export const agentOrdersApi = {
  create:  (data: CreateOrderForm)  => api.post('/agent-orders', data).then((r) => r.data),
  get:     (id: string)             => api.get(`/agent-orders/${id}`).then((r) => r.data),
  list:    ()                       => api.get('/agent-orders').then((r) => r.data),
  mockPay: (id: string)             => api.post(`/agent-orders/${id}/mock-pay`).then((r) => r.data),
};

// ─── Payments info ─────────────────────────────────────────
export const paymentsApi = {
  info: () => api.get('/payments/info').then((r) => r.data),
};
