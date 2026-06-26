import { notFound } from 'next/navigation';

import { getServerClient } from '@/lib/supabase/server';
import { restaurantService } from '@/lib/services';
import { CheckoutClient } from '@/components/customer/CheckoutClient';

/**
 * Checkout page.
 *
 * Loads the restaurant (for tax rate, currency, Stripe account, and the
 * configured delivery fee from its settings) and renders the interactive
 * checkout. The cart itself lives client-side in the CartProvider.
 */
export default async function CheckoutPage({
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

  // Delivery fee is stored in the restaurant settings notification/printer-style
  // config object; default to 0 when unset so pickup-only stores work.
  const settingsResult = await restaurantService.getRestaurantSettings(
    client,
    result.data.id,
  );
  const config = (settingsResult.data?.notification_config ?? {}) as {
    delivery_fee?: number;
  };
  const deliveryFee =
    typeof config.delivery_fee === 'number' ? config.delivery_fee : 0;

  return (
    <CheckoutClient
      restaurant={result.data}
      deliveryFee={deliveryFee}
      stripeAccountId={result.data.stripe_account_id}
    />
  );
}
