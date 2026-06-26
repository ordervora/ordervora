/**
 * Coupon evaluation — shared authoritative rules.
 *
 * Both the pricing engine (at checkout) and the validate-coupon function use
 * these helpers, so a coupon is judged by EXACTLY the same logic whether the
 * client is previewing it or the server is committing it. Reads use the
 * service-role client passed in, so usage counts and limits are trusted.
 */

import type { Client } from './supabase.ts';
import type { Tables } from './types.ts';

export type Coupon = Tables<'coupons'>;

export interface CouponEvaluationInput {
  restaurantId: string;
  code: string;
  subtotal: number;
  /** When provided, enforces the per-customer redemption limit. */
  customerId?: string | null;
}

export interface CouponEvaluation {
  valid: boolean;
  reason: string | null;
  coupon: Coupon | null;
}

/** Rounds to 2 decimals. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Evaluates whether a coupon may be applied. Checks existence, active status,
 * expiry, global usage limit, minimum subtotal, and (when a customer is given)
 * the per-customer redemption limit against the trusted redemption count.
 */
export async function evaluateCoupon(
  service: Client,
  input: CouponEvaluationInput,
): Promise<CouponEvaluation> {
  const code = input.code.trim();
  if (code.length === 0) {
    return { valid: false, reason: 'Enter a coupon code.', coupon: null };
  }

  const { data: coupon, error } = await service
    .from('coupons')
    .select('*')
    .eq('restaurant_id', input.restaurantId)
    .eq('code', code)
    .maybeSingle();

  if (error) {
    return { valid: false, reason: error.message, coupon: null };
  }
  if (!coupon) {
    return { valid: false, reason: 'Code not found.', coupon: null };
  }
  if (!coupon.is_active) {
    return { valid: false, reason: 'This code is no longer active.', coupon };
  }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: 'This code has expired.', coupon };
  }
  if (coupon.usage_limit !== null && coupon.uses_count >= coupon.usage_limit) {
    return { valid: false, reason: 'This code has been fully redeemed.', coupon };
  }
  if (input.subtotal < coupon.min_subtotal) {
    return {
      valid: false,
      reason: `Spend at least ${coupon.min_subtotal.toFixed(2)} to use this code.`,
      coupon,
    };
  }

  if (
    input.customerId &&
    coupon.per_customer_limit !== null &&
    coupon.per_customer_limit > 0
  ) {
    const { count, error: countError } = await service
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', coupon.id)
      .eq('customer_id', input.customerId);

    if (countError) {
      return { valid: false, reason: countError.message, coupon };
    }
    if ((count ?? 0) >= coupon.per_customer_limit) {
      return {
        valid: false,
        reason: 'You have already used this code the maximum number of times.',
        coupon,
      };
    }
  }

  return { valid: true, reason: null, coupon };
}

/**
 * Computes the discount amount (major units) a valid coupon yields for a given
 * subtotal and delivery fee. Caller is responsible for clamping the result to
 * the discountable base.
 */
export function computeDiscount(
  coupon: Coupon,
  amounts: { subtotal: number; deliveryFee: number },
): number {
  switch (coupon.type) {
    case 'percent':
      return round2((amounts.subtotal * Number(coupon.value)) / 100);
    case 'fixed':
      return round2(Number(coupon.value));
    case 'free_delivery':
      return round2(amounts.deliveryFee);
    case 'free_item':
      // A free-item coupon's value carries the item price to deduct; the
      // checkout flow validates the item is present before applying.
      return round2(Number(coupon.value));
    default:
      return 0;
  }
}
