import { notFound } from 'next/navigation';

import { getServerClient } from '@/lib/supabase/server';
import { restaurantService } from '@/lib/services';
import { OrderHistoryClient } from '@/components/customer/OrderHistoryClient';

/**
 * Order history page. Loads the restaurant and renders the history client, which
 * resolves the signed-in customer and their orders.
 */
export default async function OrderHistoryPage({
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

  return <OrderHistoryClient restaurant={result.data} />;
}
