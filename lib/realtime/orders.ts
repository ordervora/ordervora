/**
 * Realtime: orders.
 *
 * Subscribes to the live order stream for a restaurant. Powers the KDS board
 * and the dashboard live feed. Delivers operational order rows only — the
 * `orders` table carries no money (it lives in `order_financials`, which is not
 * published to realtime), so even the dashboard's realtime stream is money-free
 * and totals are fetched on demand through the financials service.
 */

import {
  type Client,
  type Unsubscribe,
  type RealtimeChange,
  type SubscriptionStatus,
  subscribeToTable,
  channelName,
} from './_shared';
import type { Tables } from '@/types/database.types';

export type OrderRow = Tables<'orders'>;
export type OrderEventRow = Tables<'order_events'>;

/**
 * Subscribes to all order changes (INSERT/UPDATE/DELETE) for a restaurant.
 * New paid orders arrive as INSERTs; state advances arrive as UPDATEs.
 *
 * Pass `onStatus` to track WebSocket lifecycle (SUBSCRIBED / CLOSED /
 * CHANNEL_ERROR / TIMED_OUT) and trigger refetches after reconnects.
 */
export function subscribeToRestaurantOrders(
  client: Client,
  restaurantId: string,
  onChange: (change: RealtimeChange<OrderRow>) => void,
  onStatus?: (status: SubscriptionStatus) => void,
): Unsubscribe {
  return subscribeToTable<OrderRow>(
    client,
    {
      name: channelName(['orders', restaurantId]),
      table: 'orders',
      filter: `restaurant_id=eq.${restaurantId}`,
      onStatus,
    },
    onChange,
  );
}

/**
 * Subscribes to order-event inserts for a restaurant. Useful for the dashboard
 * to react to every transition (e.g. animating a feed) without diffing order
 * rows. Events are append-only, so only INSERTs occur.
 */
export function subscribeToRestaurantOrderEvents(
  client: Client,
  restaurantId: string,
  onInsert: (event: OrderEventRow) => void,
): Unsubscribe {
  return subscribeToTable<OrderEventRow>(
    client,
    {
      name: channelName(['order_events', restaurantId]),
      table: 'order_events',
      filter: `restaurant_id=eq.${restaurantId}`,
      event: 'INSERT',
    },
    (change) => {
      if (change.newRow) onInsert(change.newRow);
    },
  );
}
