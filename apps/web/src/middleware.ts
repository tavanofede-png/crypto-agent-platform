import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Server-side route protection via the Next.js Edge runtime.
 *
 * The access token is written to the `cap_access_token` cookie by the
 * client-side store (see store/useStore.ts setAuth / onRehydrateStorage).
 * This lets middleware read it without a round-trip to the API.
 *
 * NOTE: The cookie is NOT httpOnly (it's set by client JS), so it is
 * accessible to scripts on the same origin.  For this MVP that is
 * acceptable — the JWT is already in localStorage.  A future hardening step
 * would issue the access token as an httpOnly cookie from the API server.
 *
 * This middleware is a first line of defense — it prevents unauthenticated
 * server renders on protected pages, reducing FOUC.  The in-component
 * useEffect redirects remain as a second layer.
 */

const PROTECTED_PREFIXES = ['/agents'];
const AUTH_PATH          = '/connect';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token        = request.cookies.get('cap_access_token')?.value;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  // Unauthenticated user hits a protected page → redirect to /connect
  if (isProtected && !token) {
    const url = request.nextUrl.clone();
    url.pathname = AUTH_PATH;
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user hits /connect → redirect to /agents
  if (pathname === AUTH_PATH && token) {
    const url = request.nextUrl.clone();
    url.pathname = '/agents';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Only run middleware on relevant paths — skip static assets and API routes.
  matcher: ['/agents/:path*', '/connect'],
};
