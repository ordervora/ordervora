import { redirect } from 'next/navigation';

import { getAuthContext, canAccessDashboard } from '@/lib/rbac';
import { ROUTES } from '@/config/constants';
import { OnboardingForm } from './OnboardingForm';

/**
 * Onboarding page.
 *
 * Guards the surface (must be signed in) and skips straight to the dashboard
 * if the caller already owns/manages a restaurant — this page is only for
 * creating the FIRST restaurant.
 */
export default async function OnboardingPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect(`${ROUTES.signIn}?redirect=${ROUTES.onboarding}`);

  const alreadyHasDashboard =
    ctx.isPlatformAdmin ||
    ctx.memberships.some((m) => canAccessDashboard(ctx, m.restaurantId));
  if (alreadyHasDashboard) redirect(ROUTES.dashboard);

  return <OnboardingForm />;
}
