/**
 * Cart pricing — client-side DISPLAY math only.
 *
 * This mirrors the server pricing engine so the customer sees an accurate
 * running total as they build their cart. It is NEVER authoritative: the
 * checkout Edge Function re-reads true prices and recomputes everything. If this
 * estimate ever disagreed with the server, the server wins. Keeping the formula
 * identical (subtotal − discount + tax + delivery + tip) avoids surprises at the
 * final step.
 */

import type { CartLine } from './types';

export interface EstimateInput {
  lines: CartLine[];
  taxRate: number;
  fulfillment: 'pickup' | 'delivery';
  deliveryFee: number;
  tip: number;
  /** Discount already computed (e.g. returned by validate-coupon). */
  discount: number;
}

export interface CartEstimate {
  subtotal: number;
  discount: number;
  tax: number;
  deliveryFee: number;
  tip: number;
  total: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** The price of a single line: (base + modifier deltas) × quantity. */
export function lineTotal(line: CartLine): number {
  const modifierSum = line.modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
  return round2((line.unitPrice + modifierSum) * line.quantity);
}

/** The sum of all line totals. */
export function cartSubtotal(lines: CartLine[]): number {
  return round2(lines.reduce((sum, line) => sum + lineTotal(line), 0));
}

/** The full estimated breakdown shown to the customer before checkout. */
export function estimateCart(input: EstimateInput): CartEstimate {
  const subtotal = cartSubtotal(input.lines);
  const deliveryFee =
    input.fulfillment === 'delivery' ? round2(Math.max(0, input.deliveryFee)) : 0;
  const discount = round2(Math.min(input.discount, subtotal + deliveryFee));
  const taxableBase = Math.max(0, round2(subtotal - Math.min(discount, subtotal)));
  const tax = round2(taxableBase * input.taxRate);
  const tip = round2(Math.max(0, input.tip));
  const total = round2(subtotal - discount + tax + deliveryFee + tip);

  return { subtotal, discount, tax, deliveryFee, tip, total };
}

/** Formats a number as currency for display. */
export function formatMoney(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amount);
}
