/**
 * Reports service — analytics, manager-tier.
 *
 * Aggregations for the owner dashboard: revenue, average order value, order
 * volume, and prep-time metrics. Revenue figures read `order_financials`, so
 * these functions require a manager-tier client (kitchen-tier gets nothing from
 * RLS). Prep time is derived from `order_events` timestamps, which is
 * operational data.
 *
 * These run client-side aggregation over bounded result sets. For very high
 * volume a future phase can move heavy aggregation into SQL views or RPCs; the
 * function signatures here stay stable across that change.
 */

import {
  type Client,
  type ServiceResult,
  ok,
  fail,
  toServiceError,
} from './_shared';
import { TERMINAL_ORDER_STATES } from '@/config/constants';

export interface RevenueSummary {
  /** Sum of completed-order totals in the window. */
  revenue: number;
  /** Count of completed orders in the window. */
  orderCount: number;
  /** Average order value (revenue / orderCount), 0 when no orders. */
  averageOrderValue: number;
}

export interface PrepTimeSummary {
  /** Average seconds from `accepted` to `ready`, across measured orders. */
  averageSeconds: number;
  /** How many orders contributed a measurable prep time. */
  sampleSize: number;
}

interface DateWindow {
  from: string; // ISO timestamp, inclusive
  to: string; // ISO timestamp, exclusive
}

/**
 * Revenue, order count, and AOV for completed orders placed within a window.
 * Joins financials to orders to filter by state and time while reading totals.
 */
export async function getRevenueSummary(
  client: Client,
  restaurantId: string,
  window: DateWindow,
): Promise<ServiceResult<RevenueSummary>> {
  const { data, error } = await client
    .from('order_financials')
    .select('total, orders!inner (state, placed_at, restaurant_id)')
    .eq('restaurant_id', restaurantId)
    .eq('orders.state', 'completed')
    .gte('orders.placed_at', window.from)
    .lt('orders.placed_at', window.to);

  if (error) return fail(error.message, toServiceError(error).code);

  const rows = (data ?? []) as { total: number }[];
  const revenue = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const orderCount = rows.length;
  const averageOrderValue =
    orderCount > 0 ? Math.round((revenue / orderCount) * 100) / 100 : 0;

  return ok({
    revenue: Math.round(revenue * 100) / 100,
    orderCount,
    averageOrderValue,
  });
}

/**
 * Daily revenue series within a window: one bucket per calendar day (UTC).
 * Returns sorted points suitable for charting.
 */
export async function getDailyRevenue(
  client: Client,
  restaurantId: string,
  window: DateWindow,
): Promise<ServiceResult<{ date: string; revenue: number; orders: number }[]>> {
  const { data, error } = await client
    .from('order_financials')
    .select('total, orders!inner (state, placed_at, restaurant_id)')
    .eq('restaurant_id', restaurantId)
    .eq('orders.state', 'completed')
    .gte('orders.placed_at', window.from)
    .lt('orders.placed_at', window.to);

  if (error) return fail(error.message, toServiceError(error).code);

  const rows = (data ?? []) as {
    total: number;
    orders: { placed_at: string };
  }[];

  const buckets = new Map<string, { revenue: number; orders: number }>();
  for (const row of rows) {
    const day = row.orders.placed_at.slice(0, 10); // YYYY-MM-DD
    const bucket = buckets.get(day) ?? { revenue: 0, orders: 0 };
    bucket.revenue += Number(row.total);
    bucket.orders += 1;
    buckets.set(day, bucket);
  }

  const series = [...buckets.entries()]
    .map(([date, b]) => ({
      date,
      revenue: Math.round(b.revenue * 100) / 100,
      orders: b.orders,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return ok(series);
}

/**
 * Average prep time (accepted → ready) for orders in a window. Reads the
 * operational `orders` timestamps, not financials, so this works with any
 * staff-tier client. Orders missing either timestamp are skipped.
 */
export async function getPrepTimeSummary(
  client: Client,
  restaurantId: string,
  window: DateWindow,
): Promise<ServiceResult<PrepTimeSummary>> {
  const { data, error } = await client
    .from('orders')
    .select('accepted_at, ready_at')
    .eq('restaurant_id', restaurantId)
    .gte('placed_at', window.from)
    .lt('placed_at', window.to)
    .not('accepted_at', 'is', null)
    .not('ready_at', 'is', null);

  if (error) return fail(error.message, toServiceError(error).code);

  const rows = (data ?? []) as { accepted_at: string; ready_at: string }[];
  if (rows.length === 0) return ok({ averageSeconds: 0, sampleSize: 0 });

  const totalSeconds = rows.reduce((sum, row) => {
    const accepted = new Date(row.accepted_at).getTime();
    const ready = new Date(row.ready_at).getTime();
    return sum + Math.max(0, (ready - accepted) / 1000);
  }, 0);

  return ok({
    averageSeconds: Math.round(totalSeconds / rows.length),
    sampleSize: rows.length,
  });
}

/** Count of orders by state within a window (operational, any staff tier). */
export async function getOrderVolumeByState(
  client: Client,
  restaurantId: string,
  window: DateWindow,
): Promise<ServiceResult<Record<string, number>>> {
  const { data, error } = await client
    .from('orders')
    .select('state')
    .eq('restaurant_id', restaurantId)
    .gte('placed_at', window.from)
    .lt('placed_at', window.to);

  if (error) return fail(error.message, toServiceError(error).code);

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { state: string }[]) {
    counts[row.state] = (counts[row.state] ?? 0) + 1;
  }
  return ok(counts);
}

/** Whether a state counts as a finished sale (helper for callers). */
export function isCompletedSaleState(state: string): boolean {
  return (TERMINAL_ORDER_STATES as readonly string[]).includes(state) &&
    state === 'completed';
}
