'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Bot, Zap, Shield, Globe, ArrowRight, Cpu } from 'lucide-react';
import { useStore } from '@/store/useStore';

const features = [
  {
    icon: Bot,
    title: 'AI Agents',
    description: 'Deploy OpenClaw or ZeroClaw agents with custom SKILL.md configurations',
  },
  {
    icon: Zap,
    title: 'Crypto Payments',
    description: 'Pay with USDC/USDT via your Web3 wallet. Credits unlock agent creation',
  },
  {
    icon: Shield,
    title: 'Sandboxed Runtime',
    description: 'Each agent runs in an isolated workspace with restricted filesystem access',
  },
  {
    icon: Globe,
    title: 'Real-Time Chat',
    description: 'Stream responses via WebSocket — like ChatGPT, but on-chain',
  },
];

export default function LandingPage() {
  const { isAuthenticated } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) router.replace('/agents');
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Gradient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      {/* Nav */}
      <header className="relative z-10 border-b border-zinc-800/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-6 w-6 text-violet-400" />
            <span className="font-semibold text-white">CryptoAgent</span>
          </div>
          <Link
            href="/connect"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Launch App
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pt-24 pb-16">
        <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
          Powered by ZeroClaw &amp; OpenClaw
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight max-w-3xl leading-tight mb-6">
          AI Agents,{' '}
          <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            On-Chain
          </span>
        </h1>

        <p className="text-xl text-zinc-400 max-w-xl mb-10 leading-relaxed">
          Connect your wallet, pay with crypto, and deploy intelligent agents with custom skills — running in real time.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/connect"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-8 py-4 rounded-xl transition-all hover:scale-[1.02] shadow-lg shadow-violet-600/25"
          >
            Connect Wallet
            <ArrowRight className="h-5 w-5" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold px-8 py-4 rounded-xl transition-colors"
          >
            Learn More
          </a>
        </div>

        {/* Stats */}
        <div className="flex gap-8 mt-16 text-center">
          {[
            { label: 'Frameworks', value: '2' },
            { label: 'LLM Models', value: '5+' },
            { label: 'Skill Templates', value: '3' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-3xl font-bold text-white">{value}</div>
              <div className="text-sm text-zinc-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
      </main>

      {/* Features */}
      <section id="features" className="relative z-10 max-w-6xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
            >
              <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-violet-400" />
              </div>
              <h3 className="font-semibold text-white mb-2">{title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-zinc-800/60 py-6 text-center text-zinc-600 text-sm">
        Crypto Agent Platform · MVP
      </footer>
    </div>
  );
}
