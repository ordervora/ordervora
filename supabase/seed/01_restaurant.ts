/**
 * Seed 01 — restaurant + settings.
 *
 * Creates (or re-uses) the Demo Deli tenant and its settings row. Idempotent on
 * the slug: re-running returns the existing restaurant id rather than duplicating
 * it, so the rest of the seed can be re-run against a stable tenant. Demo Deli is
 * a generic neighborhood deli — nothing here is hardcoded as a platform default;
 * it is just tenant data identified by its slug.
 */

import { type SeedClient, unwrap, logStep, DEMO_SLUG } from './_shared';

export interface SeededRestaurant {
  id: string;
  slug: string;
  name: string;
  currency: string;
  taxRate: number;
}

const BRAND_COLORS = {
  brand: '#C8842E',
  brandInk: '#FFFFFF',
  ink: '#1A1714',
  paper: '#FBF8F3',
};

const HOURS = {
  monday: '7:00 AM – 9:00 PM',
  tuesday: '7:00 AM – 9:00 PM',
  wednesday: '7:00 AM – 9:00 PM',
  thursday: '7:00 AM – 9:00 PM',
  friday: '7:00 AM – 10:00 PM',
  saturday: '8:00 AM – 10:00 PM',
  sunday: '8:00 AM – 8:00 PM',
};

const LOYALTY_CONFIG = {
  tiers: [
    { name: 'Bronze', minPoints: 0, multiplier: 1 },
    { name: 'Silver', minPoints: 100, multiplier: 1.1 },
    { name: 'Gold', minPoints: 300, multiplier: 1.25 },
    { name: 'VIP', minPoints: 750, multiplier: 1.5 },
  ],
};

const NOTIFICATION_CONFIG = {
  delivery_fee: 3.99,
  escalation_seconds: 600,
};

export async function seedRestaurant(
  client: SeedClient,
): Promise<SeededRestaurant> {
  logStep(`Restaurant "${DEMO_SLUG}"`);

  // Idempotent: reuse an existing row for this slug if present.
  const existing = await client
    .from('restaurants')
    .select('id, slug, name, currency, tax_rate')
    .eq('slug', DEMO_SLUG)
    .maybeSingle();

  let restaurant: {
    id: string;
    slug: string;
    name: string;
    currency: string;
    tax_rate: number;
  };

  if (existing.data) {
    restaurant = existing.data;
  } else {
    restaurant = unwrap(
      await client
        .from('restaurants')
        .insert({
          slug: DEMO_SLUG,
          name: 'Demo Deli',
          logo_url: null,
          brand_colors: BRAND_COLORS,
          address: '128 Market Street',
          city: 'Springfield',
          region: 'IL',
          postal_code: '62701',
          country: 'US',
          phone: '+1-555-0142',
          email: 'hello@demodeli.example',
          timezone: 'America/Chicago',
          hours: HOURS,
          tax_rate: 0.0825,
          currency: 'USD',
          is_active: true,
        })
        .select('id, slug, name, currency, tax_rate')
        .single(),
    );
  }

  // Settings row (1:1). Upsert so re-runs refresh config without duplicating.
  unwrap(
    await client
      .from('restaurant_settings')
      .upsert({
        restaurant_id: restaurant.id,
        sound_config: { enabled: true, volume: 1, event_sounds: { new_order: 'restaurant_bell', priority_order: 'alarm', ready: 'pickup_ready', cancelled: 'soft_bell', driver_assigned: 'digital' } },
        printer_config: { enabled: false, printer_name: null },
        notification_config: NOTIFICATION_CONFIG,
        security_config: { require_pin_for_refunds: true },
        loyalty_config: LOYALTY_CONFIG,
      })
      .select('restaurant_id')
      .single(),
  );

  logStep(`  → ${restaurant.name} (${restaurant.id})`);

  return {
    id: restaurant.id,
    slug: restaurant.slug,
    name: restaurant.name,
    currency: restaurant.currency,
    taxRate: Number(restaurant.tax_rate),
  };
}
