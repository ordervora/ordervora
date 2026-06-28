'use client';

/**
 * Onboarding form.
 *
 * Collects a restaurant name + URL slug (auto-derived from the name until the
 * user edits it directly) and creates the restaurant via the `createRestaurant`
 * server action, seating the caller as owner. On success, sends them straight
 * into the dashboard for the new restaurant.
 */

import { useState, useTransition } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { createRestaurant } from './actions';
import { ROUTES } from '@/config/constants';
import { Spinner } from '@/components/Spinner';

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function handleSlugChange(event: ChangeEvent<HTMLInputElement>) {
    setSlugTouched(true);
    setSlug(slugify(event.target.value));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createRestaurant({ name, slug, email, phone });
      if (result.ok && result.restaurantId) {
        router.push(`${ROUTES.dashboard}?restaurant=${result.restaurantId}`);
        return;
      }
      setMessage(result.message);
      setIsError(!result.ok);
    });
  }

  return (
    <main className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 400 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          Create your restaurant
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>
          You&rsquo;ll be the owner. You can invite staff and finish setup
          afterward.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
          <label htmlFor="name" style={{ fontSize: 13, fontWeight: 600 }}>
            Restaurant name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={handleNameChange}
            placeholder="Demo Deli"
            className="auth-input"
          />

          <label htmlFor="slug" style={{ fontSize: 13, fontWeight: 600 }}>
            URL slug
          </label>
          <input
            id="slug"
            type="text"
            required
            value={slug}
            onChange={handleSlugChange}
            placeholder="demo-deli"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            minLength={3}
            maxLength={60}
            className="auth-input"
          />
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: -8 }}>
            Customers will order at /{slug || 'your-slug'}
          </p>

          <label htmlFor="email" style={{ fontSize: 13, fontWeight: 600 }}>
            Contact email (optional)
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            placeholder="hello@demodeli.com"
            className="auth-input"
          />

          <label htmlFor="phone" style={{ fontSize: 13, fontWeight: 600 }}>
            Phone (optional)
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
            placeholder="(555) 555-0100"
            className="auth-input"
          />

          <button
            type="submit"
            className="auth-btn"
            disabled={isPending}
            style={{ marginTop: 8 }}
          >
            {isPending && <Spinner />}
            {isPending ? 'Creating…' : 'Create restaurant'}
          </button>
        </form>

        {message && (
          <p
            role={isError ? 'alert' : 'status'}
            style={{
              marginTop: 16,
              fontSize: 13,
              color: isError ? '#b91c1c' : '#047857',
            }}
          >
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
