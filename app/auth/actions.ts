'use server';

/**
 * Authentication server actions.
 *
 * Two sign-in paths, both backed by Supabase Auth:
 *   - `signInWithEmail` : sends a magic-link / OTP to the address.
 *   - `signInWithOAuth` : starts an OAuth flow (e.g. Google) and returns the
 *                         provider URL for the client to navigate to.
 *
 * Both build redirect URLs that route through `/auth/callback`, which completes
 * the session exchange. A `redirect` path is threaded through so the user lands
 * back where they started after authenticating.
 */

import type { Provider } from '@supabase/supabase-js';

import { getServerClient } from '@/lib/supabase/server';
import { clientEnv } from '@/config/env';
import { ROUTES } from '@/config/constants';

export interface AuthActionResult {
  ok: boolean;
  message: string;
}

function buildCallbackUrl(redirectTo: string): string {
  const url = new URL(ROUTES.authCallback, clientEnv.siteUrl);
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/';
  url.searchParams.set('redirect', safeRedirect);
  return url.toString();
}

/** Sends a one-time sign-in link to the given email address. */
export async function signInWithEmail(
  email: string,
  redirectTo: string = '/',
): Promise<AuthActionResult> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }

  const supabase = await getServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: buildCallbackUrl(redirectTo),
      shouldCreateUser: true,
    },
  });

  if (error) {
    return { ok: false, message: 'Could not send the sign-in link. Try again.' };
  }

  return { ok: true, message: 'Check your email for a sign-in link.' };
}

/**
 * Starts an OAuth flow and returns the provider authorization URL. The client
 * navigates to it; the provider returns the user to `/auth/callback`.
 */
export async function signInWithOAuth(
  provider: Provider,
  redirectTo: string = '/',
): Promise<AuthActionResult & { url?: string }> {
  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: buildCallbackUrl(redirectTo),
    },
  });

  if (error || !data?.url) {
    return { ok: false, message: 'Could not start sign-in. Try again.' };
  }

  return { ok: true, message: 'Redirecting…', url: data.url };
}
