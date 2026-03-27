import { io, Socket } from 'socket.io-client';

/** Base URL for Socket.IO (no path). Falls back to API URL so prod works if only NEXT_PUBLIC_API_URL is set. */
function resolveSocketBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_WS_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3001';
  let base = raw.trim().replace(/\/$/, '');
  if (base.endsWith('/api')) {
    base = base.slice(0, -4);
  }
  return base;
}

const WS_URL = resolveSocketBaseUrl();

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (socket?.connected) return socket;

  if (socket) {
    socket.disconnect();
  }

  socket = io(`${WS_URL}/chat`, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export type { Socket };
