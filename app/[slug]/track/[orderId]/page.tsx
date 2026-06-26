import { notFound } from 'next/navigation';

import { getServerClient } from '@/lib/supabase/server';
import { restaurantService, orderService } from '@/lib/services';
import { OrderTracker } from '@/components/customer/OrderTracker';

/**
 * Order tracking page.
 *
 * Loads the order's number and fulfillment type server-side (RLS scopes this to
 * the order's owner), then hands off to the live tracker which subscribes for
 * realtime status. Reached after checkout and from order history.
 */
export default async function TrackPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>;
}) {
  const { slug, orderId } = await params;
  const client = await getServerClient();

  const restaurantResult = await restaurantService.getRestaurantBySlug(
    client,
    slug,
  );
  if (restaurantResult.error || !restaurantResult.data) {
    notFound();
  }

  const orderResult = await orderService.getOrderDetail(client, orderId);
  if (orderResult.error || !orderResult.data) {
    notFound();
  }

  const order = orderResult.data;

  return (
    <OrderTracker
      orderId={order.id}
      orderNumber={order.order_number}
      slug={slug}
      fulfillment={order.fulfillment}
    />
  );
}
