'use client';

import { Suspense, useState, useTransition } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import {
  signInWithPassword,
  signUpWithPassword,
  signInWithEmail,
  signInWithOAuth,
} from '../actions';
import { Spinner } from '@/components/Spinner';

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'That sign-in link was incomplete. Request a new one.',
  auth_failed: 'That sign-in link expired or was already used. Request a new one.',
};

type AuthMode = 'signin' | 'signup' | 'magic';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/dashboard';
  const callbackError = searchParams.get('error');

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initialError = callbackError ? ERROR_MESSAGES[callbackError] ?? null : null;

  function switchMode(next: AuthMode) {
    setMode(next);
    setStatus(null);
  }

  function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result =
        mode === 'signup'
          ? await signUpWithPassword(email, password)
          : await signInWithPassword(email, password);

      setStatus(result.message);
      setIsError(!result.ok);

      if (result.ok && mode === 'signin') {
        router.push(redirectTo);
        router.refresh();
      }

      // If signup auto-confirmed (email confirmation disabled in Supabase),
      // redirect to dashboard immediately instead of waiting for email.
      if (result.ok && mode === 'signup' && result.message.includes('Signing you in')) {
        setTimeout(() => {
          router.push(redirectTo);
          router.refresh();
        }, 800);
      }
    });
  }

  function handleMagicLink(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await signInWithEmail(email, redirectTo);
      setStatus(result.message);
      setIsError(!result.ok);
    });
  }

  function handleGoogle() {
    startTransition(async () => {
      const result = await signInWithOAuth('google', redirectTo);
      if (result.ok && result.url) {
        window.location.assign(result.url);
        return;
      }
      setStatus(result.message);
      setIsError(true);
    });
  }

  const message = status ?? initialError;
  const messageIsError = status ? isError : Boolean(initialError);

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          {mode === 'signup' ? 'Create your account' : 'Sign in to OrderVora'}
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
          {mode === 'signup'
            ? 'Start accepting orders in minutes.'
            : mode === 'magic'
              ? "We'll email you a one-click sign-in link."
              : 'Welcome back.'}
        </p>

        {/* Sign in / Create account tabs */}
        {mode !== 'magic' && (
          <div
            style={{
              display: 'flex',
              gap: 2,
              background: '#f3f4f6',
              borderRadius: 8,
              padding: 3,
              marginBottom: 20,
            }}
          >
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  background: mode === m ? '#fff' : 'transparent',
                  color: mode === m ? '#111' : '#6b7280',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                  transition: 'all .15s',
                }}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>
        )}

        {mode === 'magic' ? (
          <form onSubmit={handleMagicLink} style={{ display: 'grid', gap: 12 }}>
            <label htmlFor="email-magic" style={{ fontSize: 13, fontWeight: 600 }}>
              Email
            </label>
            <input
              id="email-magic"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="auth-input"
            />
            <button type="submit" className="auth-btn" disabled={isPending}>
              {isPending && <Spinner />}
              {isPending ? 'Sending…' : 'Send sign-in link'}
            </button>
            <button
              type="button"
              className="auth-btn"
              data-variant="ghost"
              onClick={() => switchMode('signin')}
              style={{ marginTop: 4 }}
            >
              ← Sign in with password instead
            </button>
          </form>
        ) : (
          <form onSubmit={handlePasswordSubmit} style={{ display: 'grid', gap: 12 }}>
            <label htmlFor="email-pw" style={{ fontSize: 13, fontWeight: 600 }}>
              Email
            </label>
            <input
              id="email-pw"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="auth-input"
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <label htmlFor="password" style={{ fontSize: 13, fontWeight: 600 }}>
                Password
              </label>
              {mode === 'signin' && (
                <Link
                  href="/auth/reset-password"
                  style={{ fontSize: 12, color: '#6b7280', textDecoration: 'underline' }}
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 8 : 1}
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
              className="auth-input"
            />
            <button type="submit" className="auth-btn" disabled={isPending}>
              {isPending && <Spinner />}
              {isPending
                ? 'Working…'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Sign in'}
            </button>
          </form>
        )}

        {mode !== 'magic' && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                margin: '16px 0',
                color: '#9ca3af',
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              or
              <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <button
                type="button"
                className="auth-btn"
                data-variant="ghost"
                onClick={handleGoogle}
                disabled={isPending}
              >
                {isPending && <Spinner />}
                Continue with Google
              </button>
              <button
                type="button"
                className="auth-btn"
                data-variant="ghost"
                onClick={() => switchMode('magic')}
                disabled={isPending}
              >
                Send me a magic link instead
              </button>
            </div>
          </>
        )}

        {message && (
          <p
            role={messageIsError ? 'alert' : 'status'}
            style={{
              marginTop: 16,
              fontSize: 13,
              color: messageIsError ? '#b91c1c' : '#047857',
              background: messageIsError ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${messageIsError ? '#fecaca' : '#bbf7d0'}`,
              borderRadius: 6,
              padding: '8px 12px',
            }}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
