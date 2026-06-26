/**
 * Order service.
 *
 * Operational order data — the order rows, their line items, modifiers, and the
 * event log. This service deliberately does NOT read or write money: totals,
 * line prices, tips and taxes live in the financials service behind manager-tier
 * RLS. Order creation with payment is the checkout Edge Function's job (Phase 3);
 * here we cover reading, listing, and advancing state, which is what the
 * dashboard and the customer tracker need.
 */

import {
  type Client,
  type ServiceResult,
  ok,
  fail,
  toServiceError,
  isNotFound,
} from './_shared';
import {
  KDS_ACTIVE_STATES,
  TERMINAL_ORDER_STATES,
  type OrderState,
} from '@/config/constants';
import type { Tables } from '@/types/database.types';

export type Order = Tables<'orders'>;
export type OrderItem = Tables<'order_items'>;
export type OrderItemModifier = Tables<'order_item_modifiers'>;
export type OrderEvent = Tables<'order_events'>;

/** An order item with its chosen modifiers (operational view, no prices). */
export interface OrderItemWithModifiers extends OrderItem {
  order_item_modifiers: OrderItemModifier[];
}

/** A full operational order: the row, its items+modifiers, and its event log. */
export interface OrderDetail extends Order {
  order_items: OrderItemWithModifiers[];
  order_events: OrderEvent[];
}

/** Allowed forward transitions for an order's lifecycle. */
const ALLOWED_TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  completed: ['refunded'],
  cancelled: [],
  refunded: [],
};

/** True when `to` is a legal next state from `from`. */
export function canTransition(from: OrderState, to: OrderState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

interface ListOrdersOptions {
  /** Restrict to specific states (e.g. active board, or a history view). */
  states?: readonly OrderState[];
  /** Max rows to return. */
  limit?: number;
  /** Newest first when true (default), oldest first when false. */
  newestFirst?: boolean;
}

/**
 * Lists orders for a restaurant. RLS scopes rows to what the caller may see
 * (staff see all of their restaurant; a customer client sees only their own).
 */
export async function listOrders(
  client: Client,
  restaurantId: string,
  options: ListOrdersOptions = {},
): Promise<ServiceResult<Order[]>> {
  const { states, limit = 100, newestFirst = true } = options;

  let query = client
    .from('orders')
    .select('*')
    .eq('restaurant_id', restaurantId);

  if (states && states.length > 0) {
    query = query.in('state', states as OrderState[]);
  }

  query = query.order('placed_at', { ascending: !newestFirst }).limit(limit);

  const { data, error } = await query;
  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Lists the active (non-terminal, live) orders for a restaurant. */
export async function listActiveOrders(
  client: Client,
  restaurantId: string,
): Promise<ServiceResult<Order[]>> {
  return listOrders(client, restaurantId, {
    states: KDS_ACTIVE_STATES,
    newestFirst: false,
  });
}

/** Lists completed/cancelled/refunded orders (history). */
export async function listOrderHistory(
  client: Client,
  restaurantId: string,
  limit = 100,
): Promise<ServiceResult<Order[]>> {
  return listOrders(client, restaurantId, {
    states: TERMINAL_ORDER_STATES,
    limit,
  });
}

/** Loads one order with its items, modifiers, and event log (no money). */
export async function getOrderDetail(
  client: Client,
  orderId: string,
): Promise<ServiceResult<OrderDetail>> {
  const { data, error } = await client
    .from('orders')
    .select(
      `*,
       order_items (
         *,
         order_item_modifiers (*)
       ),
       order_events (*)`,
    )
    .eq('id', orderId)
    .single();

  if (error) {
    if (isNotFound(error)) return fail('Order not found.', error.code);
    return fail(error.message, toServiceError(error).code);
  }

  const raw = data as Order & {
    order_items: OrderItemWithModifiers[] | null;
    order_events: OrderEvent[] | null;
  };

  const detail: OrderDetail = {
    ...raw,
    order_items: (raw.order_items ?? []).map((item) => ({
      ...item,
      order_item_modifiers: item.order_item_modifiers ?? [],
    })),
    order_events: (raw.order_events ?? []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    ),
  };

  return ok(detail);
}

/**
 * Advances an order to a new state. Validates the transition client-side first
 * (fast feedback), then writes it; the database trigger logs the event and
 * stamps the lifecycle timestamp. RLS requires the caller to be staff of the
 * restaurant. The `note` is recorded by the caller separately if needed.
 */
export async function advanceOrderState(
  client: Client,
  orderId: string,
  toState: OrderState,
): Promise<ServiceResult<Order>> {
  // Read current state to validate the transition.
  const { data: current, error: readError } = await client
    .from('orders')
    .select('state')
    .eq('id', orderId)
    .single();

  if (readError) {
    if (isNotFound(readError)) return fail('Order not found.', readError.code);
    return fail(readError.message, toServiceError(readError).code);
  }

  if (!canTransition(current.state, toState)) {
    return fail(
      `Cannot move an order from "${current.state}" to "${toState}".`,
      'invalid_transition',
    );
  }

  const { data, error } = await client
    .from('orders')
    .update({ state: toState })
    .eq('id', orderId)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Returns the ordered event log for an order (tracker / prep-time history). */
export async function getOrderEvents(
  client: Client,
  orderId: string,
): Promise<ServiceResult<OrderEvent[]>> {
  const { data, error } = await client
    .from('order_events')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}
