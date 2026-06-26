/**
 * Coupon service.
 *
 * Coupon lookup, a client-side validation preview, manager-tier CRUD, and the
 * redemption audit. IMPORTANT: the authoritative coupon check happens in the
 * checkout Edge Function (Phase 3) — `validatePreview` here is a fast, optimistic
 * check for UI feedback only and must never be the sole gate on a discount.
 */

import {
  type Client,
  type ServiceResult,
  ok,
  fail,
  toServiceError,
  isNotFound,
} from './_shared';
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
} from '@/types/database.types';

export type Coupon = Tables<'coupons'>;
export type CouponRedemption = Tables<'coupon_redemptions'>;

export interface CouponValidation {
  valid: boolean;
  reason: string | null;
  coupon: Coupon | null;
}

/** Looks up an active coupon by code (case-insensitive via citext). */
export async function getCouponByCode(
  client: Client,
  restaurantId: string,
  code: string,
): Promise<ServiceResult<Coupon | null>> {
  const { data, error } = await client
    .from('coupons')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('code', code.trim())
    .maybeSingle();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/**
 * Optimistic, client-side validation for UI feedback. Checks active status,
 * expiry, global usage limit, and minimum subtotal. The server re-validates
 * authoritatively at checkout, including per-customer limits which require a
 * trusted redemption count.
 */
export async function validatePreview(
  client: Client,
  restaurantId: string,
  code: string,
  subtotal: number,
): Promise<ServiceResult<CouponValidation>> {
  const lookup = await getCouponByCode(client, restaurantId, code);
  if (lookup.error) return fail(lookup.error.message, lookup.error.code);

  const coupon = lookup.data;
  if (!coupon) {
    return ok({ valid: false, reason: 'Code not found.', coupon: null });
  }
  if (!coupon.is_active) {
    return ok({ valid: false, reason: 'This code is no longer active.', coupon });
  }
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
    return ok({ valid: false, reason: 'This code has expired.', coupon });
  }
  if (coupon.usage_limit !== null && coupon.uses_count >= coupon.usage_limit) {
    return ok({ valid: false, reason: 'This code has been fully redeemed.', coupon });
  }
  if (subtotal < coupon.min_subtotal) {
    return ok({
      valid: false,
      reason: `Spend at least ${coupon.min_subtotal.toFixed(2)} to use this code.`,
      coupon,
    });
  }

  return ok({ valid: true, reason: null, coupon });
}

/** Lists a restaurant's coupons (manager-tier), newest first. */
export async function listCoupons(
  client: Client,
  restaurantId: string,
): Promise<ServiceResult<Coupon[]>> {
  const { data, error } = await client
    .from('coupons')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Creates a coupon (manager-tier). */
export async function createCoupon(
  client: Client,
  input: TablesInsert<'coupons'>,
): Promise<ServiceResult<Coupon>> {
  const { data, error } = await client
    .from('coupons')
    .insert(input)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Updates a coupon (manager-tier). */
export async function updateCoupon(
  client: Client,
  couponId: string,
  patch: TablesUpdate<'coupons'>,
): Promise<ServiceResult<Coupon>> {
  const { data, error } = await client
    .from('coupons')
    .update(patch)
    .eq('id', couponId)
    .select('*')
    .single();

  if (error) {
    if (isNotFound(error)) return fail('Coupon not found.', error.code);
    return fail(error.message, toServiceError(error).code);
  }
  return ok(data);
}

/** The redemption history for a coupon (manager-tier audit). */
export async function listRedemptions(
  client: Client,
  couponId: string,
): Promise<ServiceResult<CouponRedemption[]>> {
  const { data, error } = await client
    .from('coupon_redemptions')
    .select('*')
    .eq('coupon_id', couponId)
    .order('created_at', { ascending: false });

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Counts how many times a specific customer has redeemed a coupon. */
export async function countCustomerRedemptions(
  client: Client,
  couponId: string,
  customerId: string,
): Promise<ServiceResult<number>> {
  const { count, error } = await client
    .from('coupon_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', couponId)
    .eq('customer_id', customerId);

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(count ?? 0);
}
