'use client';

/**
 * useRealtimeOrders — maintains a live list of a restaurant's orders.
 *
 * Loads the initial set through the order service, then keeps it current via a
 * realtime subscription: INSERTs prepend, UPDATEs replace in place, DELETEs
 * remove. On reconnect the caller can call `refetch` to reconcile any events
 * missed while the socket was down (important for KDS on flaky kitchen wifi).
 *
 * Operational data only — order rows carry no money — so this is safe for the
 * KDS as well as the dashboard.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';
import { orderService } from '@/lib/services';
import { subscribeToRestaurantOrders } from '@/lib/realtime';
import type { Order } from '@/lib/services/order.service';
import type { OrderState } from '@/config/constants';

export interface UseRealtimeOrdersOptions {
  /** Restrict to specific states (e.g. active board). Omit for all recent. */
  states?: readonly OrderState[];
  /** Max rows on initial load. */
  limit?: number;
}

export interface UseRealtimeOrdersResult {
  orders: Order[];
  loading: boolean;
  error: string | null;
  /** Re-pull the list from the server (use after a reconnect). */
  refetch: () => Promise<void>;
}

export function useRealtimeOrders(
  restaurantId: string,
  options: UseRealtimeOrdersOptions = {},
): UseRealtimeOrdersResult {
  const { states, limit } = options;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable key for the states filter so the effect doesn't re-run on each render.
  const statesKey = states ? states.join(',') : '';

  const load = useCallback(async () => {
    const client = getBrowserClient();
    const result = await orderService.listOrders(client, restaurantId, {
      states,
      limit,
    });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setOrders(result.data);
    // states/limit are captured intentionally via statesKey + primitive limit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, statesKey, limit]);

  // Keep a ref to the active states for filtering realtime inserts.
  const statesRef = useRef<readonly OrderState[] | undefined>(states);
  statesRef.current = states;

  const refetch = useCallback(async () => {
    setLoading(true);
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    load().finally(() => {
      if (active) setLoading(false);
    });

    const client = getBrowserClient();
    const unsubscribe = subscribeToRestaurantOrders(
      client,
      restaurantId,
      (change) => {
        if (!active) return;
        const allowed = statesRef.current;

        setOrders((current) => {
          if (change.event === 'INSERT' && change.newRow) {
            const row = change.newRow;
            if (allowed && !allowed.includes(row.state)) return current;
            if (current.some((o) => o.id === row.id)) return current;
            return [row, ...current];
          }

          if (change.event === 'UPDATE' && change.newRow) {
            const row = change.newRow;
            // If a state filter is active and the row no longer qualifies, drop it.
            if (allowed && !allowed.includes(row.state)) {
              return current.filter((o) => o.id !== row.id);
            }
            const exists = current.some((o) => o.id === row.id);
            if (!exists) return [row, ...current];
            return current.map((o) => (o.id === row.id ? row : o));
          }

          if (change.event === 'DELETE' && change.oldRow) {
            return current.filter((o) => o.id !== change.oldRow!.id);
          }

          return current;
        });
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [restaurantId, load]);

  return { orders, loading, error, refetch };
}
