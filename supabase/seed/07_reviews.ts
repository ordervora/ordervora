/**
 * Seed 07 — reviews.
 *
 * Customer reviews across sources (website, google, app), some already replied
 * to by the owner and some awaiting a reply, so the dashboard reviews queue and
 * the storefront rating summary both have data. Reviews link to seeded customers
 * where applicable. All scoped by restaurant_id.
 *
 * Idempotent: cleared for this restaurant before reinsert.
 */

import { type SeedClient, unwrap, logStep, daysAgo } from './_shared';
import type { SeededCustomers } from './04_customers';

interface ReviewSpec {
  customerName: string | null;
  source: 'website' | 'google' | 'app';
  rating: number;
  text: string;
  reply: string | null;
  daysAgo: number;
}

const REVIEWS: ReviewSpec[] = [
  {
    customerName: 'Jordan Blake',
    source: 'website',
    rating: 5,
    text: 'The Italian Combo is the best in town. Fast pickup every time.',
    reply: 'Thanks Jordan — see you next week!',
    daysAgo: 2,
  },
  {
    customerName: 'Amara Singh',
    source: 'google',
    rating: 5,
    text: 'Delivery was quick and everything was still hot. Great mac and cheese.',
    reply: null,
    daysAgo: 4,
  },
  {
    customerName: 'Eli Rosen',
    source: 'app',
    rating: 4,
    text: 'Solid burgers. Would love a spicier sauce option.',
    reply: 'Noted! A spicy house sauce is in the works.',
    daysAgo: 7,
  },
  {
    customerName: 'Nina Costa',
    source: 'website',
    rating: 4,
    text: 'Lovely caprese press, though the line was a bit long at noon.',
    reply: null,
    daysAgo: 10,
  },
  {
    customerName: null,
    source: 'google',
    rating: 5,
    text: 'Friendly staff and fresh ingredients. New regular here.',
    reply: 'Welcome to the neighborhood — thank you!',
    daysAgo: 14,
  },
];

export async function seedReviews(
  client: SeedClient,
  restaurantId: string,
  customers: SeededCustomers,
  replierId: string | null,
): Promise<void> {
  logStep('Reviews');

  await client.from('reviews').delete().eq('restaurant_id', restaurantId);

  for (const spec of REVIEWS) {
    const customerId = spec.customerName
      ? customers.byName[spec.customerName] ?? null
      : null;
    const replied = spec.reply !== null;

    unwrap(
      await client
        .from('reviews')
        .insert({
          restaurant_id: restaurantId,
          customer_id: customerId,
          product_id: null,
          source: spec.source,
          rating: spec.rating,
          text: spec.text,
          reply: spec.reply,
          replied,
          replied_by: replied ? replierId : null,
          replied_at: replied ? daysAgo(spec.daysAgo - 1) : null,
          is_published: true,
          created_at: daysAgo(spec.daysAgo),
        })
        .select('id')
        .single(),
    );

    logStep(`  → ${spec.rating}★ (${spec.source})${replied ? ' · replied' : ''}`);
  }
}
