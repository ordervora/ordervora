'use client';

/**
 * AccountClient — the customer's account hub.
 *
 * Shows the loyalty balance and tier with progress toward the next tier, plus
 * links to order history and saved addresses. When signed out, it presents the
 * auth panel instead. Loyalty tier thresholds come from the restaurant's
 * loyalty_config; the balance is the customer's points cache (kept honest by the
 * ledger reconciliation trigger).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { Restaurant } from '@/lib/services/restaurant.service';
import { useAuth } from '@/hooks/useAuth';
import { useCustomer } from '@/hooks/useCustomer';
import { resolveTier, type LoyaltyTier } from '@/lib/services/loyalty.service';
import { SkeletonBlock } from '@/components/customer/Skeleton';
import { AuthPanel } from './AuthPanel';

export interface AccountClientProps {
  restaurant: Restaurant;
}

function readTiers(restaurant: Restaurant): LoyaltyTier[] {
  const config = (restaurant as { loyalty_config?: unknown }).loyalty_config;
  // Tiers may be stored on restaurant_settings.loyalty_config; when absent we
  // fall back to a sensible default ladder so the card still renders.
  const fromConfig = Array.isArray(config) ? (config as LoyaltyTier[]) : null;
  return (
    fromConfig ?? [
      { name: 'Bronze', minPoints: 0, multiplier: 1 },
      { name: 'Silver', minPoints: 100, multiplier: 1.1 },
      { name: 'Gold', minPoints: 300, multiplier: 1.25 },
      { name: 'VIP', minPoints: 750, multiplier: 1.5 },
    ]
  );
}

export function AccountClient({ restaurant }: AccountClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { customer, loading } = useCustomer(restaurant.id);

  const tiers = useMemo(() => readTiers(restaurant), [restaurant]);

  const points = customer?.points ?? 0;
  const currentTier = resolveTier(points, tiers);
  const nextTier = useMemo(() => {
    const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints);
    return sorted.find((t) => t.minPoints > points) ?? null;
  }, [tiers, points]);

  const progress = nextTier
    ? Math.min(
        100,
        Math.round(
          ((points - (currentTier?.minPoints ?? 0)) /
            (nextTier.minPoints - (currentTier?.minPoints ?? 0))) *
            100,
        ),
      )
    : 100;

  async function handleSignOut() {
    await fetch('/auth/sign-out', { method: 'POST' });
    router.push(`/${restaurant.slug}`);
    router.refresh();
  }

  return (
    <div className="ov-shell">
      <div className="ov-topbar">
        <Link className="ov-back" href={`/${restaurant.slug}`}>
          ← Menu
        </Link>
        <h1>Account</h1>
      </div>

      <div className="ov-pad ov-stack">
        {authLoading || loading ? (
          <div className="ov-stack">
            <SkeletonBlock height={92} style={{ borderRadius: 14 }} />
            <SkeletonBlock height={52} style={{ borderRadius: 12 }} />
            <SkeletonBlock height={52} style={{ borderRadius: 12 }} />
          </div>
        ) : !user ? (
          <AuthPanel redirectTo={`/${restaurant.slug}/account`} />
        ) : (
          <>
            <div className="ov-loyalty">
              <div className="ov-loyalty-points">{points} pts</div>
              <div className="ov-loyalty-tier">
                {currentTier?.name ?? 'Member'}
                {nextTier
                  ? ` · ${nextTier.minPoints - points} pts to ${nextTier.name}`
                  : ' · Top tier'}
              </div>
              <div className="ov-progress">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>

            <Link
              className="ov-card ov-row"
              href={`/${restaurant.slug}/account/orders`}
              style={{ textDecoration: 'none', color: 'var(--ink)' }}
            >
              <span style={{ fontWeight: 700 }}>Order history</span>
              <span style={{ color: 'var(--muted)' }}>›</span>
            </Link>

            <Link
              className="ov-card ov-row"
              href={`/${restaurant.slug}/account/addresses`}
              style={{ textDecoration: 'none', color: 'var(--ink)' }}
            >
              <span style={{ fontWeight: 700 }}>Saved addresses</span>
              <span style={{ color: 'var(--muted)' }}>›</span>
            </Link>

            {customer && (
              <div className="ov-card">
                <div className="ov-row">
                  <span className="ov-row-label">Name</span>
                  <span className="ov-row-value">{customer.name ?? '—'}</span>
                </div>
                <div className="ov-row">
                  <span className="ov-row-label">Phone</span>
                  <span className="ov-row-value">{customer.phone ?? '—'}</span>
                </div>
                <div className="ov-row">
                  <span className="ov-row-label">Email</span>
                  <span className="ov-row-value">{customer.email ?? '—'}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              className="ov-btn"
              data-variant="ghost"
              data-block="true"
              onClick={handleSignOut}
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
