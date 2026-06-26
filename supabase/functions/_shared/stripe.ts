/**
 * Stripe client for the Edge runtime.
 *
 * Uses the platform secret key. Restaurant-specific operations (creating a
 * PaymentIntent, issuing a refund) are performed on the restaurant's CONNECTED
 * account by passing `{ stripeAccount }` to the call — see usage in the
 * checkout and refund functions. The Deno-compatible fetch HTTP client is used
 * so Stripe works under Edge Functions.
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

if (!STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable.');
}

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

/** Platform fee in basis points (e.g. 500 = 5%). Configurable per deployment. */
export const PLATFORM_FEE_BPS = Number(
  Deno.env.get('PLATFORM_FEE_BPS') ?? '0',
);

/** Computes the application fee (in minor units) for a given order total. */
export function applicationFeeAmount(totalMinorUnits: number): number {
  if (PLATFORM_FEE_BPS <= 0) return 0;
  return Math.round((totalMinorUnits * PLATFORM_FEE_BPS) / 10_000);
}
