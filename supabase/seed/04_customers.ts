/**
 * Seed 04 — customers + addresses.
 *
 * Creates guest-style customer records (no auth account) plus saved addresses,
 * spanning loyalty tiers and lifetime values so the customer list and loyalty
 * features have realistic variety. One customer is marked VIP to exercise the
 * KDS VIP treatment when their orders appear. All scoped by restaurant_id.
 *
 * Idempotent: this restaurant's customers are cleared before reinsert.
 */

import { type SeedClient, unwrap, logStep, daysAgo } from './_shared';

export interface SeededCustomers {
  /** name -> customer id */
  byName: Record<string, string>;
  /** ordered list of ids for assigning orders */
  ids: string[];
}

interface CustomerSpec {
  name: string;
  email: string;
  phone: string;
  points: number;
  tier: string;
  lifetimeValue: number;
  orderCount: number;
  isVip: boolean;
  lastOrderDaysAgo: number;
  address: { line1: string; city: string } | null;
}

const CUSTOMERS: CustomerSpec[] = [
  {
    name: 'Jordan Blake',
    email: 'jordan.blake@example.com',
    phone: '+1-555-0191',
    points: 820,
    tier: 'VIP',
    lifetimeValue: 612.4,
    orderCount: 47,
    isVip: true,
    lastOrderDaysAgo: 1,
    address: { line1: '44 Cedar Lane', city: 'Springfield' },
  },
  {
    name: 'Amara Singh',
    email: 'amara.singh@example.com',
    phone: '+1-555-0184',
    points: 340,
    tier: 'Gold',
    lifetimeValue: 288.15,
    orderCount: 22,
    isVip: false,
    lastOrderDaysAgo: 3,
    address: { line1: '900 Birch Avenue, Apt 5', city: 'Springfield' },
  },
  {
    name: 'Eli Rosen',
    email: 'eli.rosen@example.com',
    phone: '+1-555-0176',
    points: 145,
    tier: 'Silver',
    lifetimeValue: 132.8,
    orderCount: 11,
    isVip: false,
    lastOrderDaysAgo: 6,
    address: null,
  },
  {
    name: 'Nina Costa',
    email: 'nina.costa@example.com',
    phone: '+1-555-0168',
    points: 60,
    tier: 'Bronze',
    lifetimeValue: 54.25,
    orderCount: 4,
    isVip: false,
    lastOrderDaysAgo: 12,
    address: { line1: '17 Willow Court', city: 'Springfield' },
  },
  {
    name: 'Theo Park',
    email: 'theo.park@example.com',
    phone: '+1-555-0153',
    points: 0,
    tier: 'Bronze',
    lifetimeValue: 0,
    orderCount: 0,
    isVip: false,
    lastOrderDaysAgo: 0,
    address: null,
  },
];

export async function seedCustomers(
  client: SeedClient,
  restaurantId: string,
): Promise<SeededCustomers> {
  logStep('Customers + addresses');

  await client.from('customers').delete().eq('restaurant_id', restaurantId);

  const byName: Record<string, string> = {};
  const ids: string[] = [];

  for (const spec of CUSTOMERS) {
    const customer = unwrap(
      await client
        .from('customers')
        .insert({
          restaurant_id: restaurantId,
          auth_user_id: null,
          name: spec.name,
          email: spec.email,
          phone: spec.phone,
          points: spec.points,
          tier: spec.tier,
          lifetime_value: spec.lifetimeValue,
          order_count: spec.orderCount,
          last_order_at:
            spec.lastOrderDaysAgo > 0 ? daysAgo(spec.lastOrderDaysAgo) : null,
          is_vip: spec.isVip,
          marketing_opt_in: true,
        })
        .select('id')
        .single(),
    );

    byName[spec.name] = customer.id;
    ids.push(customer.id);

    if (spec.address) {
      unwrap(
        await client
          .from('customer_addresses')
          .insert({
            restaurant_id: restaurantId,
            customer_id: customer.id,
            label: 'home',
            line1: spec.address.line1,
            city: spec.address.city,
            region: 'IL',
            postal_code: '62701',
            is_default: true,
          })
          .select('id')
          .single(),
      );
    }

    logStep(`  → ${spec.name} (${spec.tier}, ${spec.points} pts)`);
  }

  return { byName, ids };
}
