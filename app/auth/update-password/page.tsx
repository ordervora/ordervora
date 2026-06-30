'use client';

import { useState, useTransition } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { updatePassword } from '../actions';
import { Spinner } from '@/components/Spinner';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setStatus('Passwords do not match.');
      setIsError(true);
      return;
    }
    startTransition(async () => {
      const result = await updatePassword(password);
      setStatus(result.message);
      setIsError(!result.ok);
      if (result.ok) {
        setTimeout(() => router.push('/dashboard'), 1500);
      }
    });
  }

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 380 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          Set a new password
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
          Choose a strong password of at least 8 characters.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <label htmlFor="password" style={{ fontSize: 13, fontWeight: 600 }}>
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="auth-input"
          />
          <label htmlFor="confirm" style={{ fontSize: 13, fontWeight: 600 }}>
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)}
            placeholder="Repeat password"
            className="auth-input"
          />
          <button type="submit" className="auth-btn" disabled={isPending}>
            {isPending && <Spinner />}
            {isPending ? 'Saving…' : 'Set new password'}
          </button>
        </form>

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
            {!isError && ' Redirecting to dashboard…'}
          </p>
        )}
      </div>
    </main>
  );
}
