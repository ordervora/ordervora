'use client';

/**
 * Sign-in page.
 *
 * A minimal, functional auth entry point for Phase 0: email magic-link and
 * Google OAuth. It reads the `redirect` query param so users return to the
 * page they were trying to reach, and surfaces any `error` passed back from the
 * callback. Visual design is intentionally plain here — the branded surfaces
 * are built in later phases.
 */

import { Suspense, useState, useTransition } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';

import { signInWithEmail, signInWithOAuth } from '../actions';
import { Spinner } from '@/components/Spinner';

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'That sign-in link was incomplete. Request a new one.',
  auth_failed: 'That sign-in link expired or was already used. Request a new one.',
};

function SignInForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/';
  const callbackError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initialError = callbackError ? ERROR_MESSAGES[callbackError] ?? null : null;

  function handleEmailSubmit(event: FormEvent) {
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
      <div className="auth-card" style={{ maxWidth: 360 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          Sign in to OrderVora
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
          Use your email or continue with Google.
        </p>

        <form onSubmit={handleEmailSubmit} style={{ display: 'grid', gap: 12 }}>
          <label htmlFor="email" style={{ fontSize: 13, fontWeight: 600 }}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setEmail(e.target.value)
            }
            placeholder="you@example.com"
            className="auth-input"
          />
          <button type="submit" className="auth-btn" disabled={isPending}>
            {isPending && <Spinner />}
            {isPending ? 'Working…' : 'Send sign-in link'}
          </button>
        </form>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            margin: '18px 0',
            color: '#9ca3af',
            fontSize: 12,
          }}
        >
          <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          or
          <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        </div>

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

        {message && (
          <p
            role={messageIsError ? 'alert' : 'status'}
            style={{
              marginTop: 16,
              fontSize: 13,
              color: messageIsError ? '#b91c1c' : '#047857',
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
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
