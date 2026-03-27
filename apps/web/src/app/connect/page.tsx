'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cpu, Loader2, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { isAddress } from 'viem';

export default function ConnectPage() {
  const router = useRouter();
  const { isAuthenticated, isAuthenticating, error, signIn } = useWallet();

  const [address, setAddress] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (isAuthenticated) router.replace('/agents');
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    const trimmed = address.trim();
    if (!trimmed) {
      setValidationError('Ingresá tu dirección de wallet.');
      return;
    }
    if (!isAddress(trimmed)) {
      setValidationError('Dirección inválida. Debe empezar con 0x y tener 42 caracteres.');
      return;
    }

    await signIn(trimmed);
  };

  const displayError = validationError || error;
  const addressIsValid = isAddress(address.trim());

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Background glows — same as landing page */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 border-b border-zinc-800/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center">
          <div className="flex items-center gap-2">
            <Cpu className="h-6 w-6 text-violet-400" />
            <span className="font-semibold text-white">CryptoAgent</span>
          </div>
        </div>
      </header>

      {/* Center card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">

          {/* Heading */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium px-3 py-1.5 rounded-full mb-5">
              <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
              Beexo Wallet
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Conectá tu wallet</h1>
            <p className="text-zinc-500 text-sm">
              Ingresá tu dirección para acceder a la plataforma
            </p>
          </div>

          {/* Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">

            {/* Error */}
            {displayError && (
              <div className="flex gap-2 items-start bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl p-3 mb-6">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{displayError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">
                  Dirección de wallet
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setValidationError('');
                  }}
                  disabled={isAuthenticating}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30 text-white placeholder-zinc-600 rounded-xl px-4 py-3 text-sm font-mono outline-none transition-all disabled:opacity-50"
                  autoComplete="off"
                  spellCheck={false}
                />

                {/* Inline valid indicator */}
                {address.length > 10 && addressIsValid && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-mono">
                      {address.trim().slice(0, 8)}…{address.trim().slice(-6)}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-600/50 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-violet-600/20 hover:shadow-violet-600/30 active:scale-[0.98]"
              >
                {isAuthenticating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Conectando…</span>
                  </>
                ) : (
                  <>
                    <span>Conectar</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-zinc-700 text-xs mt-6">
            Al conectar aceptás los Términos de Servicio
          </p>
        </div>
      </main>
    </div>
  );
}
