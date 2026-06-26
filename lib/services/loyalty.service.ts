/**
 * Loyalty service.
 *
 * The append-only points ledger and derived balances. The customer's `points`
 * column is a cache; the ledger in `loyalty_points` is the source of truth.
 * A customer reads their own ledger; manager-tier reads and writes all of a
 * restaurant's ledger entries (awards, adjustments, redemptions).
 *
 * Tier definitions live in `restaurant_settings.loyalty_config`; this service
 * reads the ledger and computes balance, and exposes a helper to resolve a tier
 * from a points total against a provided tier table.
 */

import {
  type Client,
  type ServiceResult,
  ok,
  fail,
  toServiceError,
} from './_shared';
import type {
  Tables,
  TablesInsert,
  LoyaltyReasonEnum,
} from '@/types/database.types';

export type LoyaltyEntry = Tables<'loyalty_points'>;

/** A loyalty tier definition as stored in restaurant_settings.loyalty_config. */
export interface LoyaltyTier {
  name: string;
  minPoints: number;
  multiplier: number;
}

/** The ledger entries for a customer, newest first. */
export async function getLedger(
  client: Client,
  customerId: string,
  limit = 100,
): Promise<ServiceResult<LoyaltyEntry[]>> {
  const { data, error } = await client
    .from('loyalty_points')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/**
 * Computes a customer's current points balance by summing the ledger. Reads all
 * deltas (RLS-scoped) and totals them, so the result is correct even if the
 * cached `customers.points` column has drifted.
 */
export async function getBalance(
  client: Client,
  customerId: string,
): Promise<ServiceResult<number>> {
  const { data, error } = await client
    .from('loyalty_points')
    .select('points_delta')
    .eq('customer_id', customerId);

  if (error) return fail(error.message, toServiceError(error).code);

  const balance = ((data ?? []) as { points_delta: number }[]).reduce(
    (sum: number, row: { points_delta: number }) => sum + row.points_delta,
    0,
  );
  return ok(balance);
}

/**
 * Records a ledger entry (manager-tier or system). Positive deltas earn points,
 * negative deltas redeem them. `order_id` links the entry to an order when the
 * award/redemption is order-driven.
 */
export async function recordEntry(
  client: Client,
  input: {
    restaurantId: string;
    customerId: string;
    pointsDelta: number;
    reason: LoyaltyReasonEnum;
    orderId?: string | null;
    note?: string | null;
  },
): Promise<ServiceResult<LoyaltyEntry>> {
  const row: TablesInsert<'loyalty_points'> = {
    restaurant_id: input.restaurantId,
    customer_id: input.customerId,
    points_delta: input.pointsDelta,
    reason: input.reason,
    order_id: input.orderId ?? null,
    note: input.note ?? null,
  };

  const { data, error } = await client
    .from('loyalty_points')
    .insert(row)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/**
 * Resolves which tier a points total falls into, given a tier table (highest
 * threshold not exceeding the total wins). Returns null when no tier qualifies.
 */
export function resolveTier(
  points: number,
  tiers: readonly LoyaltyTier[],
): LoyaltyTier | null {
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  return sorted.find((tier) => points >= tier.minPoints) ?? null;
}
