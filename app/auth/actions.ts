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

/**
 * Maps a Supabase Auth error to a message safe to show the user. Logs the raw
 * error server-side (visible in Vercel function logs) since GoTrue's own
 * messages are often either too technical or, for rate limits, accurate
 * enough to show directly.
 */
function describeAuthError(error: { message: string; code?: string; status?: number }): string {
  console.error('[auth]', error.status, error.code, error.message);

  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many sign-in attempts. Wait a minute and try again.';
  }
  if (error.code === 'signup_disabled') {
    return 'New sign-ups are currently disabled.';
  }
  if (error.code === 'email_address_invalid') {
    return 'That email address looks invalid.';
  }
  if (
    error.message.toLowerCase().includes('redirect') ||
    error.code === 'validation_failed'
  ) {
    return 'Sign-in is misconfigured for this domain. Contact support.';
  }
  // Temporary: surface the raw GoTrue error since we have no log access from this
  // environment right now. Revert to a generic message once the cause is fixed.
  return `Could not send the sign-in link. [${error.status ?? 'n/a'}/${error.code ?? 'no-code'}] ${error.message}`;
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
    return { ok: false, message: describeAuthError(error) };
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
    if (error) {
      console.error('[auth] oauth', provider, error.status, error.code, error.message);
      return {
        ok: false,
        message: `Could not start sign-in. [${error.status ?? 'n/a'}/${error.code ?? 'no-code'}] ${error.message}`,
      };
    }
    return { ok: false, message: 'Could not start sign-in. Try again.' };
  }

  return { ok: true, message: 'Redirecting…', url: data.url };
}
