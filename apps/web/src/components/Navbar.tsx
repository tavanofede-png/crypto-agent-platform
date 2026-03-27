'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Cpu, LayoutGrid, LogOut, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { cn } from '@repo/ui';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { disconnect, address } = useWallet();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const navLinks = [
    { href: '/agents', label: 'Agents', icon: LayoutGrid },
  ];

  const handleLogout = () => {
    setDropdownOpen(false);
    disconnect(); // calls wagmiDisconnect() + store.logout()
    router.push('/');
  };

  // Address comes from wagmi useAccount (verified provider address)
  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/agents" className="flex items-center gap-2 text-white font-semibold">
          <Cpu className="h-5 w-5 text-violet-400" />
          <span className="hidden sm:block">CryptoAgent</span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                pathname.startsWith(href)
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Wallet dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-zinc-200 font-mono text-xs">
              {shortAddress ?? '—'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-52 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 py-1 animate-fade-in">
                {/* Full address */}
                {address && (
                  <div className="px-4 py-2.5 border-b border-zinc-800">
                    <p className="text-xs text-zinc-500 mb-0.5">Connected wallet</p>
                    <p className="text-xs text-zinc-300 font-mono break-all">{address}</p>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Disconnect
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
