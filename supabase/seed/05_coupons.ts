/**
 * Seed 05 — coupons.
 *
 * One coupon of each type so the validate-coupon function and checkout pricing
 * can be exercised end to end: a percentage discount, a fixed amount, free
 * delivery, and a free-item value. One coupon carries a per-customer limit and
 * another a global usage cap to test those paths. All scoped by restaurant_id.
 *
 * Idempotent: cleared for this restaurant before reinsert.
 */

import { type SeedClient, unwrap, logStep } from './_shared';

interface CouponSpec {
  code: string;
  type: 'percent' | 'fixed' | 'free_delivery' | 'free_item';
  value: number;
  minSubtotal: number;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  daysUntilExpiry: number | null;
}

const COUPONS: CouponSpec[] = [
  {
    code: 'WELCOME10',
    type: 'percent',
    value: 10,
    minSubtotal: 0,
    usageLimit: null,
    perCustomerLimit: 1,
    daysUntilExpiry: 90,
  },
  {
    code: 'SAVE5',
    type: 'fixed',
    value: 5,
    minSubtotal: 20,
    usageLimit: 500,
    perCustomerLimit: null,
    daysUntilExpiry: 60,
  },
  {
    code: 'FREESHIP',
    type: 'free_delivery',
    value: 0,
    minSubtotal: 15,
    usageLimit: null,
    perCustomerLimit: null,
    daysUntilExpiry: 30,
  },
  {
    code: 'FREEFRIES',
    type: 'free_item',
    value: 3.75,
    minSubtotal: 12,
    usageLimit: 200,
    perCustomerLimit: 2,
    daysUntilExpiry: 45,
  },
];

export async function seedCoupons(
  client: SeedClient,
  restaurantId: string,
): Promise<void> {
  logStep('Coupons');

  await client.from('coupons').delete().eq('restaurant_id', restaurantId);

  for (const spec of COUPONS) {
    const expiresAt =
      spec.daysUntilExpiry === null
        ? null
        : new Date(Date.now() + spec.daysUntilExpiry * 86_400_000).toISOString();

    unwrap(
      await client
        .from('coupons')
        .insert({
          restaurant_id: restaurantId,
          code: spec.code,
          type: spec.type,
          value: spec.value,
          min_subtotal: spec.minSubtotal,
          usage_limit: spec.usageLimit,
          uses_count: 0,
          per_customer_limit: spec.perCustomerLimit,
          expires_at: expiresAt,
          is_active: true,
        })
        .select('id')
        .single(),
    );

    logStep(`  → ${spec.code} (${spec.type})`);
  }
}
