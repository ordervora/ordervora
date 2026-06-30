'use server';

/**
 * Authentication server actions.
 *
 * Sign-in paths:
 *   - `signInWithPassword`  : email + password (primary for restaurant owners).
 *   - `signInWithEmail`     : magic-link / OTP fallback (still supported).
 *   - `signInWithOAuth`     : OAuth providers (e.g. Google).
 *
 * Account management:
 *   - `signUpWithPassword`  : creates account with email + password.
 *   - `resetPassword`       : sends a password-reset email.
 *   - `updatePassword`      : sets a new password for the authenticated user.
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

function describeAuthError(error: { message: string; code?: string; status?: number }): string {
  console.error('[auth]', error.status, error.code, error.message);

  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (error.code === 'invalid_credentials') {
    return 'Incorrect email or password.';
  }
  if (error.code === 'email_not_confirmed') {
    return 'Please verify your email before signing in.';
  }
  if (error.code === 'signup_disabled') {
    return 'New sign-ups are currently disabled.';
  }
  if (error.code === 'email_address_invalid') {
    return 'That email address looks invalid.';
  }
  if (error.code === 'user_already_exists') {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (
    error.message.toLowerCase().includes('redirect') ||
    error.code === 'validation_failed'
  ) {
    return 'Sign-in is misconfigured for this domain. Contact support.';
  }
  return error.message || 'Something went wrong. Please try again.';
}

/** Signs in with email and password. */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  if (!password) {
    return { ok: false, message: 'Enter your password.' };
  }

  try {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    if (error) return { ok: false, message: describeAuthError(error) };
    return { ok: true, message: 'Signed in.' };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[auth] signInWithPassword threw', detail);
    return { ok: false, message: 'Sign-in failed. Please try again.' };
  }
}

/**
 * Creates a new account with email and password. Sends a confirmation email.
 * On success, the user still needs to verify their email before signing in
 * (unless email confirmations are disabled in Supabase settings).
 */
export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<AuthActionResult> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }

  try {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.signUp({
      email: trimmed,
      password,
      options: {
        emailRedirectTo: buildCallbackUrl(ROUTES.dashboard),
      },
    });
    if (error) return { ok: false, message: describeAuthError(error) };
    return {
      ok: true,
      message: 'Account created — check your email to confirm it, then sign in.',
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[auth] signUpWithPassword threw', detail);
    return { ok: false, message: 'Sign-up failed. Please try again.' };
  }
}

/** Sends a password-reset email. */
export async function resetPassword(email: string): Promise<AuthActionResult> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }

  try {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: buildCallbackUrl('/auth/update-password'),
    });
    if (error) return { ok: false, message: describeAuthError(error) };
    return {
      ok: true,
      message: 'Check your email for a password reset link.',
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[auth] resetPassword threw', detail);
    return { ok: false, message: 'Could not send reset email. Please try again.' };
  }
}

/** Sets a new password for the currently authenticated user. */
export async function updatePassword(password: string): Promise<AuthActionResult> {
  if (password.length < 8) {
    return { ok: false, message: 'Password must be at least 8 characters.' };
  }

  try {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: describeAuthError(error) };
    return { ok: true, message: 'Password updated successfully.' };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[auth] updatePassword threw', detail);
    return { ok: false, message: 'Could not update password. Please try again.' };
  }
}

/** Sends a one-time sign-in link (magic link / OTP) to the given email. */
export async function signInWithEmail(
  email: string,
  redirectTo: string = '/',
): Promise<AuthActionResult> {
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { ok: false, message: 'Enter a valid email address.' };
  }

  try {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: buildCallbackUrl(redirectTo),
        shouldCreateUser: true,
      },
    });
    if (error) return { ok: false, message: describeAuthError(error) };
    return { ok: true, message: 'Check your email for a sign-in link.' };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[auth] signInWithEmail threw', detail);
    return { ok: false, message: 'Could not send sign-in link. Please try again.' };
  }
}

/**
 * Starts an OAuth flow and returns the provider authorization URL. The client
 * navigates to it; the provider returns the user to `/auth/callback`.
 */
export async function signInWithOAuth(
  provider: Provider,
  redirectTo: string = '/',
): Promise<AuthActionResult & { url?: string }> {
  try {
    const supabase = await getServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: buildCallbackUrl(redirectTo),
      },
    });

    if (error || !data?.url) {
      if (error) {
        return { ok: false, message: describeAuthError(error) };
      }
      return { ok: false, message: 'Could not start sign-in. Try again.' };
    }

    return { ok: true, message: 'Redirecting…', url: data.url };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[auth] signInWithOAuth threw', detail);
    return { ok: false, message: 'Sign-in failed. Please try again.' };
  }
}
