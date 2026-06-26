import { notFound } from 'next/navigation';

import { getServerClient } from '@/lib/supabase/server';
import { restaurantService } from '@/lib/services';
import { AddressesClient } from '@/components/customer/AddressesClient';

/**
 * Saved addresses page. Loads the restaurant and renders the addresses client,
 * which resolves the signed-in customer and their saved addresses.
 */
export default async function AddressesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await getServerClient();

  const result = await restaurantService.getRestaurantBySlug(client, slug);
  if (result.error || !result.data) {
    notFound();
  }

  return <AddressesClient restaurant={result.data} />;
}
