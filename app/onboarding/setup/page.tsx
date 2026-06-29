import { redirect } from 'next/navigation';

import { getAuthContext, canAccessDashboard } from '@/lib/rbac';
import { getServerClient } from '@/lib/supabase/server';
import { restaurantService } from '@/lib/services';
import { ROUTES } from '@/config/constants';
import { SetupWizard } from './SetupWizard';

import './wizard.css';

/**
 * Setup wizard entry point.
 *
 * Guards the surface (must be signed in, must own/manage the restaurant) and
 * resolves which restaurant to onboard — `?restaurant=<id>` when known (set by
 * the onboarding form right after creation), else the caller's first
 * dashboard-accessible restaurant. Already-finished restaurants skip straight
 * to the dashboard so this route can't be revisited to redo setup.
 */
export default async function SetupWizardPage({
  searchParams,
}: {
  searchParams?: Promise<{ restaurant?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect(`${ROUTES.signIn}?redirect=${ROUTES.onboardingSetup}`);

  const accessible = ctx.memberships.filter((m) => canAccessDashboard(ctx, m.restaurantId));
  if (accessible.length === 0 && !ctx.isPlatformAdmin) redirect(ROUTES.onboarding);

  const requested = (await searchParams)?.restaurant;
  const restaurantId =
    (requested && accessible.find((m) => m.restaurantId === requested)?.restaurantId) ||
    accessible[0]?.restaurantId;

  if (!restaurantId) redirect(ROUTES.onboarding);

  const client = await getServerClient();
  const result = await restaurantService.getRestaurantById(client, restaurantId);
  if (result.error || !result.data) redirect(ROUTES.onboarding);

  const restaurant = result.data;
  if (restaurant.onboarding_step === 'done') {
    redirect(`${ROUTES.dashboard}?restaurant=${restaurant.id}`);
  }

  const settingsResult = await restaurantService.getRestaurantSettings(client, restaurant.id);

  return <SetupWizard restaurant={restaurant} settings={settingsResult.data ?? null} />;
}
