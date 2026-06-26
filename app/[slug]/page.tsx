import { notFound } from 'next/navigation';

import { getServerClient } from '@/lib/supabase/server';
import { restaurantService, menuService } from '@/lib/services';
import { Storefront } from '@/components/customer/Storefront';

/**
 * Storefront landing page.
 *
 * Server-loads the restaurant and its full menu (categories → products → images
 * → modifiers) in one pass, then hands off to the interactive Storefront. The
 * menu is public-read under RLS, so this works for guests and signed-in users
 * alike.
 */
export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getServerClient();

  const restaurantResult = await restaurantService.getRestaurantBySlug(
    client,
    slug,
  );
  if (restaurantResult.error || !restaurantResult.data) {
    notFound();
  }

  const menuResult = await menuService.getFullMenu(
    client,
    restaurantResult.data.id,
  );
  const menu = menuResult.error ? [] : menuResult.data;

  return <Storefront restaurant={restaurantResult.data} menu={menu} />;
}
