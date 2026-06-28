'use client';

/**
 * useKdsBoard — the KDS data spine.
 *
 * Loads the active ticket board through the KDS service (money-free views only),
 * then keeps it live via the realtime orders subscription. When an order's state
 * changes it refetches the affected tickets so the board, items, and modifiers
 * stay consistent. New tickets entering the board fire the sound callback.
 *
 * REVENUE FIREWALL: this hook imports only the KDS service and the realtime
 * orders channel. It never touches the financials service. The realtime stream
 * carries operational order rows (no money), and ticket contents come from the
 * `kds_tickets*` views, so no financial data can reach the board.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';
import { kdsService } from '@/lib/services';
import { subscribeToRestaurantOrders } from '@/lib/realtime';
import type { KdsTicketDetail } from '@/lib/services/kds.service';
import { KDS_ACTIVE_STATES, type OrderState } from '@/config/constants';

export interface UseKdsBoardResult {
  tickets: KdsTicketDetail[];
  loading: boolean;
  error: string | null;
  /** Order ids that just arrived, briefly, for the arrival highlight animation. */
  newTicketIds: Set<string>;
  /** Re-pull the whole board (use after a reconnect). */
  refetch: () => Promise<void>;
}

/** How long a ticket stays flagged "new" for the arrival highlight animation. */
const NEW_TICKET_HIGHLIGHT_MS = 1100;

const ACTIVE: readonly OrderState[] = KDS_ACTIVE_STATES;

function isActiveState(state: OrderState): boolean {
  return ACTIVE.includes(state);
}

export function useKdsBoard(
  restaurantId: string,
  onNewTicket?: (ticket: KdsTicketDetail) => void,
): UseKdsBoardResult {
  const [tickets, setTickets] = useState<KdsTicketDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTicketIds, setNewTicketIds] = useState<Set<string>>(new Set());

  // Track known order ids so we can detect genuinely new tickets for the sound.
  const knownIds = useRef<Set<string>>(new Set());
  const onNewTicketRef = useRef(onNewTicket);
  onNewTicketRef.current = onNewTicket;

  const flagNewTicket = useCallback((id: string) => {
    setNewTicketIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setNewTicketIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, NEW_TICKET_HIGHLIGHT_MS);
  }, []);

  const loadBoard = useCallback(async (): Promise<KdsTicketDetail[]> => {
    const client = getBrowserClient();
    const result = await kdsService.getActiveTickets(client, restaurantId);
    if (result.error) {
      setError(result.error.message);
      return [];
    }
    setError(null);
    return result.data;
  }, [restaurantId]);

  const refetch = useCallback(async () => {
    const fresh = await loadBoard();
    setTickets(fresh);
    knownIds.current = new Set(
      fresh.map((t) => t.id).filter((id): id is string => id !== null),
    );
  }, [loadBoard]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    loadBoard().then((fresh) => {
      if (!active) return;
      setTickets(fresh);
      knownIds.current = new Set(
        fresh.map((t) => t.id).filter((id): id is string => id !== null),
      );
      setLoading(false);
    });

    const client = getBrowserClient();
    const unsubscribe = subscribeToRestaurantOrders(
      client,
      restaurantId,
      (change) => {
        if (!active) return;

        const row = change.newRow ?? change.oldRow;
        if (!row) return;

        // Any change to an order that is (or was) on the board means we refetch
        // the board to pick up the authoritative ticket/item/modifier shape.
        const wasKnown = knownIds.current.has(row.id);
        const nowActive = change.newRow
          ? isActiveState(change.newRow.state)
          : false;

        // Ignore churn for orders that are neither on the board nor entering it.
        if (!wasKnown && !nowActive) return;

        void loadBoard().then((fresh) => {
          if (!active) return;

          // Detect newly-arrived active tickets to trigger the alert sound.
          const freshIds = new Set(
            fresh.map((t) => t.id).filter((id): id is string => id !== null),
          );
          for (const ticket of fresh) {
            if (ticket.id && !knownIds.current.has(ticket.id)) {
              onNewTicketRef.current?.(ticket);
              flagNewTicket(ticket.id);
            }
          }

          knownIds.current = freshIds;
          setTickets(fresh);
        });
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [restaurantId, loadBoard]);

  return { tickets, loading, error, newTicketIds, refetch };
}
