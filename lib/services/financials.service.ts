/**
 * Financials service — money, manager-tier only.
 *
 * The counterpart to the KDS firewall: everything monetary lives here behind
 * manager/owner RLS. Order totals, per-line prices, payments, and product cost
 * (margin) are read through this module. A kitchen-tier client calling these
 * will receive empty/denied results from RLS; callers should gate by role.
 *
 * This module is the ONLY place product cost and payment rows are read, so the
 * revenue surface is auditable from one file.
 */

import {
  type Client,
  type ServiceResult,
  ok,
  fail,
  toServiceError,
} from './_shared';
import type { Tables } from '@/types/database.types';

export type OrderFinancials = Tables<'order_financials'>;
export type OrderItemFinancials = Tables<'order_item_financials'>;
export type Payment = Tables<'payments'>;
export type ProductCost = Tables<'product_costs'>;

/** The financial totals for a single order. */
export async function getOrderFinancials(
  client: Client,
  orderId: string,
): Promise<ServiceResult<OrderFinancials | null>> {
  const { data, error } = await client
    .from('order_financials')
    .select('*')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Per-line financials for an order's items. */
export async function getOrderItemFinancials(
  client: Client,
  orderId: string,
): Promise<ServiceResult<OrderItemFinancials[]>> {
  const { data, error } = await client
    .from('order_item_financials')
    .select('*, order_items!inner (order_id)')
    .eq('order_items.order_id', orderId);

  if (error) return fail(error.message, toServiceError(error).code);

  // Strip the join helper column, returning clean financial rows.
  const rows = (data ?? []) as (OrderItemFinancials & {
    order_items?: unknown;
  })[];
  const cleaned: OrderItemFinancials[] = rows.map(
    ({ order_items: _join, ...rest }) => rest,
  );
  return ok(cleaned);
}

/** Payment records for an order (attempts and refunds). */
export async function getPaymentsForOrder(
  client: Client,
  orderId: string,
): Promise<ServiceResult<Payment[]>> {
  const { data, error } = await client
    .from('payments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** The cost/margin record for a product (manager-tier). */
export async function getProductCost(
  client: Client,
  productId: string,
): Promise<ServiceResult<ProductCost | null>> {
  const { data, error } = await client
    .from('product_costs')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Upserts a product's cost/margin data (manager-tier). */
export async function setProductCost(
  client: Client,
  restaurantId: string,
  productId: string,
  costPrice: number,
  supplier: string | null = null,
): Promise<ServiceResult<ProductCost>> {
  const { data, error } = await client
    .from('product_costs')
    .upsert({
      product_id: productId,
      restaurant_id: restaurantId,
      cost_price: costPrice,
      supplier,
    })
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}
