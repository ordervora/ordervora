'use client';

/**
 * OrderTracker — the live order status screen.
 *
 * Subscribes to the order via useOrderTracker so the steps advance in real time
 * as the kitchen works the ticket. Shows the lifecycle as a vertical timeline,
 * marking completed, current, and pending stages, with timestamps drawn from the
 * order event log. No money is shown here — this screen is about status.
 */

import Link from 'next/link';

import { useOrderTracker } from '@/hooks/useOrderTracker';
import type { OrderState } from '@/config/constants';
import { formatClock } from '@/lib/utils/time';

export interface OrderTrackerProps {
  orderId: string;
  orderNumber: number | null;
  slug: string;
  fulfillment: 'pickup' | 'delivery';
}

interface Stage {
  state: OrderState;
  label: string;
}

const PICKUP_STAGES: Stage[] = [
  { state: 'accepted', label: 'Order confirmed' },
  { state: 'preparing', label: 'Being prepared' },
  { state: 'ready', label: 'Ready for pickup' },
  { state: 'completed', label: 'Picked up' },
];

const DELIVERY_STAGES: Stage[] = [
  { state: 'accepted', label: 'Order confirmed' },
  { state: 'preparing', label: 'Being prepared' },
  { state: 'ready', label: 'Ready' },
  { state: 'out_for_delivery', label: 'Out for delivery' },
  { state: 'completed', label: 'Delivered' },
];

const ORDER_RANK: Record<OrderState, number> = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 4,
  completed: 5,
  cancelled: -1,
  refunded: -1,
};

export function OrderTracker({
  orderId,
  orderNumber,
  slug,
  fulfillment,
}: OrderTrackerProps) {
  const { state, events, loading, error } = useOrderTracker(orderId);

  const stages = fulfillment === 'delivery' ? DELIVERY_STAGES : PICKUP_STAGES;
  const currentRank = state ? ORDER_RANK[state] : 0;

  const terminalCancelled = state === 'cancelled' || state === 'refunded';

  // Map each stage to the timestamp of the event that entered it, if any.
  const eventTimeFor = (stageState: OrderState): string | null => {
    const event = events.find((e) => e.to_state === stageState);
    return event ? event.created_at : null;
  };

  return (
    <div className="ov-shell">
      <div className="ov-topbar">
        <Link className="ov-back" href={`/${slug}`}>
          ← Menu
        </Link>
        <h1>Order {orderNumber ? `#${orderNumber}` : ''}</h1>
      </div>

      <div className="ov-pad ov-stack">
        {loading && <div className="ov-empty">Loading your order…</div>}

        {error && (
          <div className="ov-error">
            We couldn’t load live updates. Refresh to try again.
          </div>
        )}

        {terminalCancelled && (
          <div className="ov-error">
            This order was {state === 'refunded' ? 'refunded' : 'cancelled'}. If
            this is unexpected, contact the restaurant.
          </div>
        )}

        {!loading && !terminalCancelled && (
          <div className="ov-card">
            <div className="ov-track-steps">
              {stages.map((stage, index) => {
                const stageRank = ORDER_RANK[stage.state];
                const done = currentRank > stageRank;
                const current = currentRank === stageRank;
                const pending = currentRank < stageRank;
                const time = eventTimeFor(stage.state);
                const isLast = index === stages.length - 1;

                return (
                  <div
                    className="ov-step"
                    key={stage.state}
                    data-done={done}
                    data-current={current}
                    data-pending={pending}
                  >
                    <div className="ov-step-rail">
                      <span className="ov-step-dot" />
                      {!isLast && <span className="ov-step-line" />}
                    </div>
                    <div className="ov-step-body">
                      <div className="ov-step-name">{stage.label}</div>
                      {time && (
                        <div className="ov-step-time">{formatClock(time)}</div>
                      )}
                      {current && !time && (
                        <div className="ov-step-time">In progress…</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Link className="ov-btn" data-variant="ghost" data-block="true" href={`/${slug}`}>
          Order something else
        </Link>
      </div>
    </div>
  );
}
