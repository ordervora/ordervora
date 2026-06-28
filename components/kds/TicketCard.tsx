'use client';

/**
 * TicketCard — a single kitchen ticket.
 *
 * Renders ONLY firewall-safe fields: order number, customer name, items,
 * modifiers, note, fulfillment, age/prep timers, and state. The data comes from
 * the `kds_tickets*` views via the KDS service, which carry no money, so there
 * is no financial field available to render even by mistake.
 *
 * The left "heat bar" fills with the order's age relative to a target time,
 * shifting cool -> hot, giving the cook a peripheral read on urgency. Action
 * buttons advance or recall the order through the order-actions hook.
 */

import { useMemo } from 'react';

import type { KdsTicketDetail } from '@/lib/services/kds.service';
import type { OrderState } from '@/config/constants';
import { secondsSince, formatDuration, formatClock } from '@/lib/utils/time';

/** Seconds at which an order is considered urgent (heat bar near full / red). */
const URGENT_AFTER_SECONDS = 12 * 60;

export interface TicketCardProps {
  ticket: KdsTicketDetail;
  /** Current time in ms, supplied by the shared ticker. */
  now: number;
  /** Column this ticket sits in, which determines its primary action. */
  column: 'waiting' | 'preparing' | 'ready';
  /** Whether an action on this order is in flight. */
  busy: boolean;
  /** Whether this ticket just arrived, for the brief arrival highlight. */
  isNew?: boolean;
  onBump: (orderId: string, toState: OrderState) => void;
  onRecall: (orderId: string, toState: OrderState) => void;
}

export function TicketCard({
  ticket,
  now,
  column,
  busy,
  isNew = false,
  onBump,
  onRecall,
}: TicketCardProps) {
  const orderId = ticket.id ?? '';
  const placedAt = ticket.placed_at ?? new Date(now).toISOString();

  // Age since the order was placed (the headline timer).
  const ageSeconds = secondsSince(placedAt, now);

  // Prep elapsed since cooking started (shown while preparing).
  const prepSeconds = ticket.started_at
    ? secondsSince(ticket.started_at, now)
    : 0;

  const urgent = ageSeconds >= URGENT_AFTER_SECONDS;

  // Heat bar height as a fraction of the urgency window (clamped 8%..100%).
  const heatScale = useMemo(() => {
    const ratio = Math.min(1, ageSeconds / URGENT_AFTER_SECONDS);
    return Math.max(0.08, ratio);
  }, [ageSeconds]);

  const isVip = ticket.is_vip ?? false;
  const fulfillment = ticket.fulfillment ?? 'pickup';

  // Primary action per column. Pickup skips out_for_delivery.
  const primary = useMemo((): { label: string; toState: OrderState } => {
    switch (column) {
      case 'waiting':
        return { label: 'Start', toState: 'preparing' };
      case 'preparing':
        return { label: 'Ready', toState: 'ready' };
      case 'ready':
        return fulfillment === 'delivery'
          ? { label: 'Out for delivery', toState: 'out_for_delivery' }
          : { label: 'Complete', toState: 'completed' };
    }
  }, [column, fulfillment]);

  // Recall target (one step back), available on preparing and ready.
  const recallTo = useMemo((): OrderState | null => {
    if (column === 'preparing') return 'accepted';
    if (column === 'ready') return 'preparing';
    return null;
  }, [column]);

  return (
    <article className="kds-ticket" data-vip={isVip} data-new={isNew}>
      <span
        className="kds-heat"
        style={{ transform: `scaleY(${heatScale})` }}
        aria-hidden="true"
      />
      <div className="kds-ticket-body">
        <div className="kds-ticket-head">
          <div>
            <div className="kds-ticket-num">
              #{ticket.order_number ?? '—'}
            </div>
            <div className="kds-ticket-sub">
              <span className="kds-tag" data-kind={fulfillment}>
                {fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}
              </span>
              {isVip && (
                <span className="kds-tag" data-kind="vip">
                  VIP
                </span>
              )}
              {urgent && (
                <span className="kds-tag" data-kind="priority">
                  Priority
                </span>
              )}
            </div>
          </div>
          <div className="kds-timer" data-urgent={urgent}>
            <div className="kds-timer-age">{formatDuration(ageSeconds)}</div>
            <div className="kds-timer-label">
              {column === 'preparing' && ticket.started_at
                ? `prep ${formatDuration(prepSeconds)}`
                : `since ${formatClock(placedAt)}`}
            </div>
          </div>
        </div>

        <div className="kds-items">
          {ticket.items.map((item) => (
            <div className="kds-item" key={item.id ?? item.name_snapshot}>
              <span className="kds-item-qty">{item.quantity ?? 1}×</span>
              <div className="kds-item-main">
                <div className="kds-item-name">{item.name_snapshot}</div>
                {item.modifiers.length > 0 && (
                  <div className="kds-item-mods">
                    {item.modifiers.map((mod) => (
                      <span
                        className="kds-item-mod"
                        key={mod.id ?? mod.modifier_name_snapshot}
                      >
                        + {mod.modifier_name_snapshot}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {ticket.note && ticket.note.trim().length > 0 && (
          <div className="kds-note">{ticket.note}</div>
        )}
      </div>

      <div className="kds-ticket-foot">
        {recallTo && (
          <button
            type="button"
            className="kds-btn"
            data-variant="ghost"
            disabled={busy}
            onClick={() => onRecall(orderId, recallTo)}
          >
            Recall
          </button>
        )}
        <button
          type="button"
          className="kds-btn"
          data-variant="primary"
          disabled={busy}
          onClick={() => onBump(orderId, primary.toState)}
        >
          {primary.label}
        </button>
      </div>
    </article>
  );
}
