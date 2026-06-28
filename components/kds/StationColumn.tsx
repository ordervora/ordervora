'use client';

/**
 * StationColumn — one column of the KDS board.
 *
 * Holds the tickets in a single workflow state (Waiting, Preparing, or Ready),
 * shows a live count, and renders each as a TicketCard. Tickets arrive
 * pre-sorted oldest-first from the board so the cook works top-to-bottom.
 */

import { Inbox, Flame, BellRing } from 'lucide-react';

import { TicketCard } from './TicketCard';
import type { KdsTicketDetail } from '@/lib/services/kds.service';
import type { OrderState } from '@/config/constants';
import type { LucideIcon } from 'lucide-react';

export type ColumnState = 'waiting' | 'preparing' | 'ready';

export interface StationColumnProps {
  state: ColumnState;
  label: string;
  tickets: KdsTicketDetail[];
  now: number;
  pendingOrderId: string | null;
  newTicketIds: Set<string>;
  onBump: (orderId: string, toState: OrderState) => void;
  onRecall: (orderId: string, toState: OrderState) => void;
}

const EMPTY_COPY: Record<ColumnState, string> = {
  waiting: 'No new orders. New tickets land here automatically.',
  preparing: 'Nothing on the line. Start a waiting ticket to begin.',
  ready: 'No orders ready for hand-off yet.',
};

const EMPTY_ICON: Record<ColumnState, LucideIcon> = {
  waiting: Inbox,
  preparing: Flame,
  ready: BellRing,
};

export function StationColumn({
  state,
  label,
  tickets,
  now,
  pendingOrderId,
  newTicketIds,
  onBump,
  onRecall,
}: StationColumnProps) {
  const EmptyIcon = EMPTY_ICON[state];
  return (
    <section className="kds-column" data-state={state}>
      <header className="kds-column-head">
        <span className="kds-column-label">{label}</span>
        <span className="kds-column-count">{tickets.length}</span>
      </header>
      <div className="kds-column-scroll">
        {tickets.length === 0 ? (
          <div className="kds-empty">
            <EmptyIcon className="kds-empty-icon" size={26} strokeWidth={1.5} />
            {EMPTY_COPY[state]}
          </div>
        ) : (
          tickets.map((ticket) => (
            <TicketCard
              key={ticket.id ?? ticket.order_number ?? Math.random()}
              ticket={ticket}
              now={now}
              column={state}
              busy={pendingOrderId === ticket.id}
              isNew={ticket.id ? newTicketIds.has(ticket.id) : false}
              onBump={onBump}
              onRecall={onRecall}
            />
          ))
        )}
      </div>
    </section>
  );
}
