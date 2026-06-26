/**
 * Realtime: order tracker.
 *
 * Subscribes to a SINGLE order for the customer-facing live tracker. Listens to
 * both the order row (for the current state) and its event log (for the precise
 * transition timeline). RLS ensures a customer only receives their own order's
 * stream. No financial data flows here — totals are loaded once at render, not
 * streamed.
 */

import {
  type Client,
  type Unsubscribe,
  subscribeToTable,
  channelName,
} from './_shared';
import type { Tables } from '@/types/database.types';
import type { OrderState } from '@/config/constants';

export type OrderRow = Tables<'orders'>;
export type OrderEventRow = Tables<'order_events'>;

export interface TrackerHandlers {
  /** Fires when the order's state changes. */
  onStateChange?: (state: OrderState, order: OrderRow) => void;
  /** Fires when a new transition event is logged. */
  onEvent?: (event: OrderEventRow) => void;
}

/**
 * Subscribes to one order's live updates. Returns a single unsubscribe that
 * tears down both the order-row and event subscriptions.
 */
export function subscribeToOrderTracker(
  client: Client,
  orderId: string,
  handlers: TrackerHandlers,
): Unsubscribe {
  const unsubscribers: Unsubscribe[] = [];

  if (handlers.onStateChange) {
    const onStateChange = handlers.onStateChange;
    unsubscribers.push(
      subscribeToTable<OrderRow>(
        client,
        {
          name: channelName(['tracker:order', orderId]),
          table: 'orders',
          filter: `id=eq.${orderId}`,
          event: 'UPDATE',
        },
        (change) => {
          if (change.newRow) {
            onStateChange(change.newRow.state, change.newRow);
          }
        },
      ),
    );
  }

  if (handlers.onEvent) {
    const onEvent = handlers.onEvent;
    unsubscribers.push(
      subscribeToTable<OrderEventRow>(
        client,
        {
          name: channelName(['tracker:events', orderId]),
          table: 'order_events',
          filter: `order_id=eq.${orderId}`,
          event: 'INSERT',
        },
        (change) => {
          if (change.newRow) onEvent(change.newRow);
        },
      ),
    );
  }

  return () => {
    for (const unsub of unsubscribers) unsub();
  };
}
