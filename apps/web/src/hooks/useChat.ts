'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket, Socket } from '@/lib/socket';
import { useStore } from '@/store/useStore';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  tokensUsed?: number;
  createdAt: Date;
}

export function useChat(agentId: string) {
  const { token } = useStore();
  const socketRef = useRef<Socket | null>(null);
  const streamingMessageRef = useRef<string>('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !agentId) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      // Join agent room and create session
      socket.emit('join-agent', agentId);
      socket.emit('new-session', agentId, (session: { id: string }) => {
        setSessionId(session.id);
      });
    });

    socket.on('disconnect', () => setIsConnected(false));

    socket.on('message-start', ({ sessionId: sid }: { sessionId: string }) => {
      setIsStreaming(true);
      streamingMessageRef.current = '';

      const streamingMsg: Message = {
        id: `streaming-${Date.now()}`,
        role: 'assistant',
        content: '',
        streaming: true,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, streamingMsg]);
    });

    socket.on('message-chunk', ({ chunk }: { chunk: string }) => {
      streamingMessageRef.current += chunk;
      const current = streamingMessageRef.current;

      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.streaming) {
          updated[lastIdx] = { ...updated[lastIdx], content: current };
        }
        return updated;
      });
    });

    socket.on(
      'message-complete',
      ({
        content,
        tokensUsed,
      }: {
        sessionId: string;
        content: string;
        tokensUsed?: number;
      }) => {
        setIsStreaming(false);
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.streaming) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content,
              streaming: false,
              tokensUsed,
              id: `msg-${Date.now()}`,
            };
          }
          return updated;
        });
        streamingMessageRef.current = '';
      },
    );

    socket.on('message-error', ({ error: err }: { error: string }) => {
      setIsStreaming(false);
      setError(err);
      setMessages((prev) => prev.filter((m) => !m.streaming));
      streamingMessageRef.current = '';
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('message-start');
      socket.off('message-chunk');
      socket.off('message-complete');
      socket.off('message-error');
    };
  }, [token, agentId]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!socketRef.current || !sessionId || !content.trim() || isStreaming) return;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setError(null);

      socketRef.current.emit('send-message', { agentId, sessionId, content });
    },
    [agentId, sessionId, isStreaming],
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    messages,
    sessionId,
    isConnected,
    isStreaming,
    error,
    sendMessage,
    clearMessages,
  };
}
