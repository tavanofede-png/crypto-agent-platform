'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useStore } from '@/store/useStore';

interface Props {
  children: React.ReactNode;
}

/**
 * AuthGuard — wraps a page and redirects unauthenticated users to /connect.
 *
 * Works as a second layer of protection after the Next.js middleware check.
 * Middleware handles the server render; AuthGuard handles the client hydration.
 *
 * Usage:
 *   export default function MyPage() {
 *     return <AuthGuard><PageContent /></AuthGuard>;
 *   }
 */
export function AuthGuard({ children }: Props) {
  const router         = useRouter();
  const isAuthenticated = useStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/connect');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  return <>{children}</>;
}
