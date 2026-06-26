/**
 * Root middleware.
 *
 * Runs on every matched request to:
 *   1. Refresh the Supabase session (keeps access tokens fresh).
 *   2. Gate the authenticated surfaces — dashboard, KDS, and admin — by
 *      redirecting unauthenticated users to sign-in.
 *
 * Fine-grained role checks (which role may open which surface, and per-tenant
 * permissions) happen in each surface's layout via the RBAC auth-context, and
 * the database enforces the real boundary through RLS. Middleware only does the
 * coarse "are you signed in at all" gate so protected pages never render for
 * anonymous users.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';
import { ROUTES } from '@/config/constants';

/** Path prefixes that require an authenticated user. */
const PROTECTED_PREFIXES = [ROUTES.dashboard, ROUTES.kds, ROUTES.admin] as const;

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isProtected(pathname) && !user) {
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = ROUTES.signIn;
    // Preserve where the user was headed so sign-in can send them back.
    signInUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  /**
   * Match everything except Next.js internals and static assets. Auth cookies
   * still need refreshing on public routes (e.g. the storefront), so the
   * matcher is broad and the per-route gating happens above.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
