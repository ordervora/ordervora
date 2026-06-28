import Link from 'next/link';

import { getAuthContext, canAccessDashboard } from '@/lib/rbac';
import { ROUTES } from '@/config/constants';

/**
 * Homepage.
 *
 * The platform's public root. OrderVora is multi-tenant: customers reach a
 * specific restaurant at /[slug], so this page explains the product and points
 * visitors to a restaurant link. It intentionally stays light — individual
 * storefronts carry each restaurant's branding.
 *
 * The "run a restaurant" CTA adapts to auth state: signed out goes to sign-in
 * (then onboarding), signed in with no restaurant yet goes to onboarding,
 * signed in with one goes straight to the dashboard.
 */
export default async function HomePage() {
  const ctx = await getAuthContext();
  const hasDashboardAccess =
    ctx !== null &&
    (ctx.isPlatformAdmin ||
      ctx.memberships.some((m) => canAccessDashboard(ctx, m.restaurantId)));

  const ctaHref = !ctx
    ? `${ROUTES.signIn}?redirect=${ROUTES.onboarding}`
    : hasDashboardAccess
      ? ROUTES.dashboard
      : ROUTES.onboarding;
  const ctaLabel = !ctx
    ? 'Sign in to get started'
    : hasDashboardAccess
      ? 'Open your dashboard'
      : 'Create your restaurant';

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        background: '#fbf8f3',
        color: '#1a1714',
      }}
    >
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
          OrderVora
        </h1>
        <p style={{ fontSize: 16, color: '#6f655c', lineHeight: 1.55, marginTop: 12 }}>
          Direct online ordering for restaurants — no marketplace markups. Each
          restaurant has its own ordering page. Open your restaurant&rsquo;s link
          to browse the menu and order pickup or delivery.
        </p>
        <p style={{ fontSize: 14, color: '#6f655c', marginTop: 18 }}>
          Run a restaurant?{' '}
          <Link href={ctaHref} style={{ color: '#c8842e', fontWeight: 700 }}>
            {ctaLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
