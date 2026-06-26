'use client';

/**
 * CartRail — the signature sticky bottom bar.
 *
 * Appears once the cart has items, showing a live count and running total, and
 * is the primary path to checkout. The total here is a display estimate (the
 * checkout function reprices authoritatively). Hidden when the cart is empty.
 */

import { useRouter } from 'next/navigation';

import { useCart } from '@/lib/cart/CartProvider';
import { cartSubtotal, formatMoney } from '@/lib/cart/pricing';

export interface CartRailProps {
  slug: string;
  currency: string;
}

export function CartRail({ slug, currency }: CartRailProps) {
  const router = useRouter();
  const { cart, itemCount } = useCart();

  if (itemCount === 0) return null;

  const subtotal = cartSubtotal(cart.lines);

  return (
    <div className="ov-rail">
      <button
        type="button"
        className="ov-rail-inner"
        onClick={() => router.push(`/${slug}/checkout`)}
      >
        <span className="ov-rail-count">{itemCount}</span>
        <span className="ov-rail-label">View cart &amp; check out</span>
        <span className="ov-rail-total">{formatMoney(subtotal, currency)}</span>
      </button>
    </div>
  );
}
