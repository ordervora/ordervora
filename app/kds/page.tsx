import { redirect } from 'next/navigation';

import { getAuthContext, canAccessKds } from '@/lib/rbac';
import { getServerClient } from '@/lib/supabase/server';
import { restaurantService } from '@/lib/services';
import { ROUTES } from '@/config/constants';
import { KdsBoard } from '@/components/kds/KdsBoard';

/**
 * KDS page.
 *
 * Resolves which restaurant's kitchen this device should display. A
 * `?restaurant=<id>` query selects a specific restaurant (for staff who work at
 * several); otherwise the first KDS-accessible membership is used. Confirms the
 * caller may open the KDS for that restaurant, loads its name, and hands off to
 * the live board.
 */
export default async function KdsPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurant?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect(`${ROUTES.signIn}?redirect=${ROUTES.kds}`);

  const { restaurant: requestedId } = await searchParams;

  // Choose the restaurant: the requested one (if the user may open its KDS), or
  // the first membership that grants KDS access.
  const accessible = ctx.memberships.filter((m) =>
    canAccessKds(ctx, m.restaurantId),
  );

  if (accessible.length === 0) {
    redirect('/');
  }

  const selected =
    (requestedId &&
      accessible.find((m) => m.restaurantId === requestedId)?.restaurantId) ||
    accessible[0]!.restaurantId;

  const client = await getServerClient();
  const result = await restaurantService.getRestaurantById(client, selected);

  if (result.error || !result.data) {
    redirect('/');
  }

  return (
    <KdsBoard restaurantId={result.data.id} restaurantName={result.data.name} />
  );
}
