'use client';

/**
 * AuthPanel — inline sign-in / sign-up, with a guest path.
 *
 * Used at checkout and on the account screen. Sign-in and sign-up are the same
 * passwordless email flow (Supabase OTP / magic link), so there's no separate
 * registration form to maintain — a first-time email simply creates the account.
 * When `allowGuest` is set, the customer can proceed without an account by
 * providing a name and phone for the order.
 */

import { useState, useTransition } from 'react';

import { signInWithEmail, signInWithOAuth } from '@/app/auth/actions';
import { Spinner } from '@/components/Spinner';

export interface GuestDetails {
  name: string;
  phone: string;
}

export interface AuthPanelProps {
  redirectTo: string;
  allowGuest?: boolean;
  onGuestContinue?: (details: GuestDetails) => void;
}

export function AuthPanel({
  redirectTo,
  allowGuest = false,
  onGuestContinue,
}: AuthPanelProps) {
  const [email, setEmail] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [mode, setMode] = useState<'account' | 'guest'>('account');
  const [isPending, startTransition] = useTransition();

  function handleEmail() {
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

  function handleGuest() {
    if (!guestName.trim() || !guestPhone.trim()) {
      setStatus('Enter your name and phone to continue as a guest.');
      setIsError(true);
      return;
    }
    onGuestContinue?.({ name: guestName.trim(), phone: guestPhone.trim() });
  }

  return (
    <div className="ov-card">
      {allowGuest && (
        <div className="ov-fulfillment" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="ov-seg"
            data-active={mode === 'account'}
            onClick={() => setMode('account')}
          >
            Sign in
          </button>
          <button
            type="button"
            className="ov-seg"
            data-active={mode === 'guest'}
            onClick={() => setMode('guest')}
          >
            Guest
          </button>
        </div>
      )}

      {mode === 'account' ? (
        <div className="ov-stack ov-stagger-in" key="account">
          <div className="ov-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="ov-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="ov-btn"
            data-block="true"
            disabled={isPending}
            onClick={handleEmail}
          >
            {isPending && <Spinner />}
            {isPending ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          <button
            type="button"
            className="ov-btn"
            data-variant="ghost"
            data-block="true"
            disabled={isPending}
            onClick={handleGoogle}
          >
            {isPending && <Spinner />}
            Continue with Google
          </button>
          <p className="ov-note">
            New here? Entering your email creates your account automatically.
          </p>
        </div>
      ) : (
        <div className="ov-stack ov-stagger-in" key="guest">
          <div className="ov-field">
            <label htmlFor="guest-name">Name</label>
            <input
              id="guest-name"
              className="ov-input"
              type="text"
              autoComplete="name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
          </div>
          <div className="ov-field">
            <label htmlFor="guest-phone">Phone</label>
            <input
              id="guest-phone"
              className="ov-input"
              type="tel"
              autoComplete="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="ov-btn"
            data-block="true"
            onClick={handleGuest}
          >
            Continue as guest
          </button>
        </div>
      )}

      {status && (
        <p
          className={isError ? 'ov-error' : 'ov-success'}
          style={{ marginTop: 12 }}
        >
          {status}
        </p>
      )}
    </div>
  );
}
