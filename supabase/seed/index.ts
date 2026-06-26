/**
 * Seed orchestrator.
 *
 * Runs every seed step in FK-dependency order against the Demo Deli tenant:
 *   restaurant + settings → staff → menu → customers + addresses → coupons
 *   → orders (items/financials/events/loyalty) → reviews.
 *
 * Multi-tenant friendly: everything is keyed by restaurant_id and the slug comes
 * from DEMO_SLUG (override with SEED_SLUG to create a second, isolated tenant).
 * Re-running is idempotent per step.
 *
 * Run with:  npx tsx supabase/seed/index.ts
 * Requires:  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.
 */

import { createSeedClient, logStep, type SeedClient } from './_shared';
import { seedRestaurant } from './01_restaurant';
import { seedStaff } from './02_staff';
import { seedMenu } from './03_menu';
import { seedCustomers } from './04_customers';
import { seedCoupons } from './05_coupons';
import { seedOrders } from './06_orders';
import { seedReviews } from './07_reviews';

/**
 * Reconciles each customer's cached `points` to the true sum of their loyalty
 * ledger. The orders step inserts ledger entries for completed orders, and the
 * ledger-sync trigger increments the cache from whatever baseline the customers
 * step set; recomputing from the ledger here guarantees the displayed balance
 * matches the ledger exactly regardless of trigger timing.
 */
async function reconcileLoyalty(
  client: SeedClient,
  restaurantId: string,
): Promise<void> {
  logStep('Reconciling loyalty balances');

  const { data: customers, error } = await client
    .from('customers')
    .select('id')
    .eq('restaurant_id', restaurantId);

  if (error) throw new Error(error.message);

  for (const customer of customers ?? []) {
    const { data: ledger, error: ledgerError } = await client
      .from('loyalty_points')
      .select('points_delta')
      .eq('customer_id', customer.id);

    if (ledgerError) throw new Error(ledgerError.message);

    const balance = (ledger ?? []).reduce(
      (sum, row) => sum + row.points_delta,
      0,
    );

    const { error: updateError } = await client
      .from('customers')
      .update({ points: balance })
      .eq('id', customer.id);

    if (updateError) throw new Error(updateError.message);
  }
}

async function main(): Promise<void> {
  const client = createSeedClient();

  // eslint-disable-next-line no-console
  console.log('Seeding Demo Deli…');

  const restaurant = await seedRestaurant(client);
  const staff = await seedStaff(client, restaurant.id);
  const menu = await seedMenu(client, restaurant.id);
  const customers = await seedCustomers(client, restaurant.id);
  await seedCoupons(client, restaurant.id);
  const orders = await seedOrders(client, restaurant.id, menu, customers);
  await seedReviews(client, restaurant.id, customers, staff.byRole.owner ?? null);

  await reconcileLoyalty(client, restaurant.id);

  // eslint-disable-next-line no-console
  console.log(
    `\nDone. Tenant "${restaurant.slug}" seeded with ${orders.count} orders.\n` +
      `Storefront:  /${restaurant.slug}\n` +
      `KDS / Dashboard sign-in: owner@demodeli.example (password set in 02_staff).`,
  );
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
