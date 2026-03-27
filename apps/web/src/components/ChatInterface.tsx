'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Bot, User, Loader2, WifiOff, Wifi, Plus, AlertTriangle } from 'lucide-react';
import { useChat, type Message } from '@/hooks/useChat';
import { cn } from '@repo/ui';

interface Props {
  agentId: string;
  agentName: string;
  agentStatus: string;
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 animate-fade-in',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isUser
            ? 'bg-violet-600 text-white'
            : 'bg-zinc-700 text-zinc-200',
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-violet-600 text-white rounded-tr-sm'
            : 'bg-zinc-800 text-zinc-100 rounded-tl-sm',
        )}
      >
        {message.streaming && message.content === '' ? (
          <div className="flex gap-1 items-center h-4">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        ) : (
          <div className="whitespace-pre-wrap">
            {message.content}
            {message.streaming && (
              <span className="inline-block w-0.5 h-4 bg-zinc-400 ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        )}

        {/* Token count */}
        {!isUser && !message.streaming && message.tokensUsed && (
          <div className="text-xs text-zinc-500 mt-1.5">
            {message.tokensUsed} tokens
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatInterface({ agentId, agentName, agentStatus }: Props) {
  const { messages, isConnected, isStreaming, error, sendMessage, startNewChat } =
    useChat(agentId);

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isAgentRunning = agentStatus === 'RUNNING';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isStreaming || !isAgentRunning) return;
    sendMessage(input.trim());
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Bot className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <div className="text-sm font-medium text-white">{agentName}</div>
            <div className="flex items-center gap-1.5 text-xs">
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-red-400" />
                  <span className="text-red-400">Disconnected</span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={startNewChat}
          disabled={isStreaming}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          title="New conversation"
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </button>
      </div>

      {/* Agent not running warning */}
      {!isAgentRunning && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm rounded-lg px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            Agent is {agentStatus.toLowerCase()}. Chat will be available once it&apos;s running.
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 scrollbar-thin">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-4">
              <Bot className="h-8 w-8 text-violet-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">
              Chat with {agentName}
            </h3>
            <p className="text-zinc-500 text-sm max-w-xs">
              Send a message to start a conversation. The agent will respond using its SKILL.md configuration.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3 mx-2 animate-fade-in">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex items-end gap-3 bg-zinc-800 border border-zinc-700 focus-within:border-violet-500 rounded-xl p-3 transition-colors">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder={
              isAgentRunning
                ? 'Message the agent… (Enter to send, Shift+Enter for newline)'
                : 'Agent is not running…'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!isAgentRunning || isStreaming}
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 resize-none outline-none max-h-40 scrollbar-thin disabled:opacity-50"
            style={{ minHeight: '24px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || !isAgentRunning}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
