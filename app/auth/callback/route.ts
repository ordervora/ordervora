/**
 * Auth callback route.
 *
 * Supabase Auth (OAuth providers and email magic links / confirmations) sends
 * the user back here with a `code`. We exchange that code for a session, which
 * sets the auth cookies, then redirect to the originally requested page (or the
 * site root). The `handle_new_user` database trigger has already provisioned
 * the user's profile row by the time we land here.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';
import { clientEnv } from '@/config/env';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectParam = searchParams.get('redirect') ?? '/';

  // Only allow same-origin relative redirects to avoid open-redirect abuse.
  const safeRedirect = redirectParam.startsWith('/') ? redirectParam : '/';

  if (!code) {
    const errorUrl = new URL('/auth/sign-in', clientEnv.siteUrl);
    errorUrl.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(errorUrl);
  }

  const supabase = await getServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errorUrl = new URL('/auth/sign-in', clientEnv.siteUrl);
    errorUrl.searchParams.set('error', 'auth_failed');
    return NextResponse.redirect(errorUrl);
  }

  return NextResponse.redirect(new URL(safeRedirect, origin));
}
