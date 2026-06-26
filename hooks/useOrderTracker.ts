'use client';

/**
 * useOrderTracker — live status for a single order, for the customer tracker.
 *
 * Loads the order's current state and event timeline, then subscribes to both
 * so the tracker advances in real time as the kitchen works the ticket. RLS
 * ensures only the order's owner receives the stream. Money is never loaded
 * here — the tracker shows status, not totals.
 */

import { useEffect, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';
import { orderService } from '@/lib/services';
import { subscribeToOrderTracker } from '@/lib/realtime';
import type { OrderEvent } from '@/lib/services/order.service';
import type { OrderState } from '@/config/constants';

export interface UseOrderTrackerResult {
  state: OrderState | null;
  events: OrderEvent[];
  loading: boolean;
  error: string | null;
}

export function useOrderTracker(orderId: string): UseOrderTrackerResult {
  const [state, setState] = useState<OrderState | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const client = getBrowserClient();

    // Initial load: current detail (for state) + event timeline.
    Promise.all([
      orderService.getOrderDetail(client, orderId),
      orderService.getOrderEvents(client, orderId),
    ]).then(([detailResult, eventsResult]) => {
      if (!active) return;

      if (detailResult.error) {
        setError(detailResult.error.message);
      } else {
        setState(detailResult.data.state);
      }

      if (!eventsResult.error) {
        setEvents(eventsResult.data);
      }

      setLoading(false);
    });

    // Live updates.
    const unsubscribe = subscribeToOrderTracker(client, orderId, {
      onStateChange: (nextState) => {
        if (active) setState(nextState);
      },
      onEvent: (event) => {
        if (!active) return;
        setEvents((current) =>
          current.some((e) => e.id === event.id)
            ? current
            : [...current, event].sort((a, b) =>
                a.created_at.localeCompare(b.created_at),
              ),
        );
      },
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [orderId]);

  return { state, events, loading, error };
}
