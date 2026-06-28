'use client';

/**
 * OrderHistoryClient — the customer's past orders, with reorder.
 *
 * Lists the signed-in customer's orders for this restaurant (RLS scopes to their
 * own), showing order number, time, item summary, and current state. "Reorder"
 * rebuilds the cart from a past order's items and modifiers and sends the
 * customer to checkout. "Track" opens the live tracker for active orders. No
 * money is shown in the list — totals live behind manager-tier RLS — so the
 * summary is item-based.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package } from 'lucide-react';

import type { Restaurant } from '@/lib/services/restaurant.service';
import { getBrowserClient } from '@/lib/supabase/client';
import { orderService, customerService } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/lib/cart/CartProvider';
import type { Order, OrderDetail } from '@/lib/services/order.service';
import { TERMINAL_ORDER_STATES, type OrderState } from '@/config/constants';
import { formatClock } from '@/lib/utils/time';
import { EmptyState } from '@/components/customer/EmptyState';
import { SkeletonOrder } from '@/components/customer/Skeleton';
import { Spinner } from '@/components/Spinner';
import { AuthPanel } from './AuthPanel';

export interface OrderHistoryClientProps {
  restaurant: Restaurant;
}

function stateTone(state: OrderState): 'active' | 'done' | 'dead' {
  if (state === 'completed') return 'done';
  if (state === 'cancelled' || state === 'refunded') return 'dead';
  return 'active';
}

function isActive(state: OrderState): boolean {
  return !(TERMINAL_ORDER_STATES as readonly string[]).includes(state);
}

export function OrderHistoryClient({ restaurant }: OrderHistoryClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { addLine, clearCart } = useCart();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const client = getBrowserClient();
    customerService
      .getCurrentCustomer(client, restaurant.id, user.id)
      .then(async (customerResult) => {
        if (!active) return;
        if (customerResult.error || !customerResult.data) {
          setOrders([]);
          setLoading(false);
          return;
        }
        const listResult = await orderService.listOrders(client, restaurant.id, {
          limit: 50,
        });
        if (!active) return;
        const mine = listResult.error
          ? []
          : listResult.data.filter(
              (o) => o.customer_id === customerResult.data!.id,
            );
        setOrders(mine);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [restaurant.id, user, authLoading]);

  async function handleReorder(orderId: string) {
    setReordering(orderId);
    const client = getBrowserClient();
    const result = await orderService.getOrderDetail(client, orderId);
    if (result.error || !result.data) {
      setReordering(null);
      return;
    }

    rebuildCart(result.data);
    router.push(`/${restaurant.slug}/checkout`);
  }

  function rebuildCart(order: OrderDetail) {
    clearCart();
    for (const item of order.order_items) {
      if (!item.product_id) continue;
      addLine({
        productId: item.product_id,
        name: item.name_snapshot,
        // Price will be re-resolved authoritatively at checkout; we seed 0 so
        // the estimate stays conservative until the menu price loads.
        unitPrice: 0,
        imageUrl: null,
        quantity: item.quantity,
        modifiers: item.order_item_modifiers.map((mod) => ({
          optionId: mod.id,
          modifierId: mod.id,
          name: mod.modifier_name_snapshot,
          priceDelta: 0,
        })),
      });
    }
  }

  return (
    <div className="ov-shell">
      <div className="ov-topbar">
        <Link className="ov-back" href={`/${restaurant.slug}/account`}>
          ← Account
        </Link>
        <h1>Order history</h1>
      </div>

      <div className="ov-pad ov-stack">
        {authLoading || loading ? (
          <div className="ov-stack">
            <SkeletonOrder />
            <SkeletonOrder />
          </div>
        ) : !user ? (
          <AuthPanel redirectTo={`/${restaurant.slug}/account/orders`} />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No orders yet"
            description="Your order history will show up here once you place your first order."
            action={{ label: 'Browse the menu', onClick: () => router.push(`/${restaurant.slug}`) }}
          />
        ) : (
          orders.map((order) => (
            <div className="ov-order" key={order.id}>
              <div className="ov-order-head">
                <div>
                  <div className="ov-order-num">#{order.order_number ?? '—'}</div>
                  <div className="ov-order-when">
                    {formatClock(order.placed_at)} ·{' '}
                    {new Date(order.placed_at).toLocaleDateString()}
                  </div>
                </div>
                <span className="ov-state" data-tone={stateTone(order.state)}>
                  {order.state.replace(/_/g, ' ')}
                </span>
              </div>

              <div
                style={{
                  marginTop: 12,
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                {isActive(order.state) && (
                  <Link
                    className="ov-btn ov-btn-grow"
                    data-variant="ghost"
                    href={`/${restaurant.slug}/track/${order.id}`}
                  >
                    Track
                  </Link>
                )}
                <button
                  type="button"
                  className="ov-btn ov-btn-grow"
                  disabled={reordering === order.id}
                  onClick={() => handleReorder(order.id)}
                >
                  {reordering === order.id && <Spinner />}
                  {reordering === order.id ? 'Adding…' : 'Reorder'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
