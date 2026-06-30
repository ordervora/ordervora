'use client';

import { useState, useTransition } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Link from 'next/link';

import { resetPassword } from '../actions';
import { Spinner } from '@/components/Spinner';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await resetPassword(email);
      setStatus(result.message);
      setIsError(!result.ok);
    });
  }

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          Reset your password
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
          Enter your email and we&apos;ll send a reset link.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <label htmlFor="email" style={{ fontSize: 13, fontWeight: 600 }}>
            Email
          </label>
          <input
            id="email"
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
            {isPending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link
            href="/auth/sign-in"
            style={{ fontSize: 13, color: '#6b7280', textDecoration: 'underline' }}
          >
            ← Back to sign in
          </Link>
        </div>

        {status && (
          <p
            role={isError ? 'alert' : 'status'}
            style={{
              marginTop: 16,
              fontSize: 13,
              color: isError ? '#b91c1c' : '#047857',
              background: isError ? '#fef2f2' : '#f0fdf4',
              border: `1px solid ${isError ? '#fecaca' : '#bbf7d0'}`,
              borderRadius: 6,
              padding: '8px 12px',
            }}
          >
            {status}
          </p>
        )}
      </div>
    </main>
  );
}
