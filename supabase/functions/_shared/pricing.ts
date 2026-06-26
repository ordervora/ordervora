/**
 * Pricing engine — THE SINGLE SOURCE OF TRUTH FOR ALL PRICING.
 *
 * The client proposes a cart by reference only: product ids, chosen modifier
 * option ids, quantities, a fulfillment type, an optional coupon code, and a
 * tip. It never sends prices. This module re-reads the true product and
 * modifier prices from the database (with the service-role client, so prices
 * cannot be tampered with by RLS-scoped reads), validates availability, applies
 * the coupon under the same rules the validate-coupon function enforces, adds
 * tax and delivery, and returns the canonical money breakdown plus fully
 * resolved, snapshot-ready line items.
 *
 * Nothing else in the system is permitted to compute order money. The checkout
 * function calls this and writes exactly what it returns.
 */

import type { Client } from './supabase.ts';
import { computeDiscount, evaluateCoupon } from './coupon.ts';
import type { Coupon } from './coupon.ts';

/** A single proposed line: a product and the modifier OPTIONS chosen for it. */
export interface CartLineInput {
  productId: string;
  quantity: number;
  /** Chosen modifier OPTION ids (not group ids). */
  modifierOptionIds: string[];
}

/** The full proposed cart — references and intent only, never prices. */
export interface CartInput {
  restaurantId: string;
  fulfillment: 'pickup' | 'delivery';
  lines: CartLineInput[];
  couponCode?: string | null;
  /** Tip in major currency units (e.g. dollars), as entered by the customer. */
  tip?: number;
  /** Delivery fee in major units, configured by the restaurant for delivery. */
  deliveryFee?: number;
}

/** A resolved modifier on a line, priced from the database. */
export interface PricedModifier {
  optionId: string;
  name: string;
  priceDelta: number;
}

/** A resolved, priced line ready to be snapshotted into order_items. */
export interface PricedLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  modifiers: PricedModifier[];
  /** (unitPrice + sum(modifier deltas)) * quantity. */
  lineTotal: number;
}

/** The canonical money breakdown. All values in major currency units. */
export interface PriceBreakdown {
  subtotal: number;
  discount: number;
  tax: number;
  deliveryFee: number;
  tip: number;
  total: number;
  couponCode: string | null;
  couponId: string | null;
}

/** The complete authoritative result the checkout function persists. */
export interface PricingResult {
  lines: PricedLine[];
  breakdown: PriceBreakdown;
}

export class PricingError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = 'PricingError';
  }
}

/** Rounds to 2 decimal places, avoiding binary float drift. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Prices a proposed cart against live database values. Throws PricingError on
 * any invalid reference, unavailable item, or coupon failure so the caller can
 * abort the checkout cleanly.
 */
export async function priceCart(
  service: Client,
  cart: CartInput,
): Promise<PricingResult> {
  if (cart.lines.length === 0) {
    throw new PricingError('Cart is empty.', 'empty_cart');
  }

  const productIds = [...new Set(cart.lines.map((l) => l.productId))];
  const optionIds = [
    ...new Set(cart.lines.flatMap((l) => l.modifierOptionIds)),
  ];

  // Re-read true product prices + availability for this restaurant only.
  const { data: products, error: productError } = await service
    .from('products')
    .select('id, name, price, is_available, restaurant_id')
    .eq('restaurant_id', cart.restaurantId)
    .in('id', productIds);

  if (productError) {
    throw new PricingError(productError.message, 'product_read_failed');
  }

  const productById = new Map(
    (products ?? []).map((p) => [p.id, p] as const),
  );

  // Every referenced product must exist in this restaurant.
  for (const id of productIds) {
    if (!productById.has(id)) {
      throw new PricingError(
        'A item in the cart is no longer on the menu.',
        'product_not_found',
      );
    }
  }

  // Re-read true modifier option prices + availability, scoped to restaurant.
  const optionById = new Map<
    string,
    { id: string; name: string; price_delta: number; is_available: boolean }
  >();

  if (optionIds.length > 0) {
    const { data: options, error: optionError } = await service
      .from('modifier_options')
      .select('id, name, price_delta, is_available, restaurant_id')
      .eq('restaurant_id', cart.restaurantId)
      .in('id', optionIds);

    if (optionError) {
      throw new PricingError(optionError.message, 'modifier_read_failed');
    }

    for (const option of options ?? []) {
      optionById.set(option.id, option);
    }

    for (const id of optionIds) {
      if (!optionById.has(id)) {
        throw new PricingError(
          'A selected option is no longer available.',
          'modifier_not_found',
        );
      }
    }
  }

  // Build priced lines from authoritative values.
  const lines: PricedLine[] = [];
  let subtotal = 0;

  for (const line of cart.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new PricingError('Invalid quantity.', 'invalid_quantity');
    }

    const product = productById.get(line.productId)!;
    if (!product.is_available) {
      throw new PricingError(
        `"${product.name}" is currently unavailable.`,
        'product_unavailable',
      );
    }

    const modifiers: PricedModifier[] = line.modifierOptionIds.map((optionId) => {
      const option = optionById.get(optionId)!;
      if (!option.is_available) {
        throw new PricingError(
          `"${option.name}" is currently unavailable.`,
          'modifier_unavailable',
        );
      }
      return {
        optionId: option.id,
        name: option.name,
        priceDelta: Number(option.price_delta),
      };
    });

    const modifierSum = modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
    const unitPrice = Number(product.price);
    const lineTotal = round2((unitPrice + modifierSum) * line.quantity);

    lines.push({
      productId: product.id,
      name: product.name,
      unitPrice,
      quantity: line.quantity,
      modifiers,
      lineTotal,
    });

    subtotal = round2(subtotal + lineTotal);
  }

  // Apply the coupon (authoritative — same rules as validate-coupon).
  let discount = 0;
  let couponCode: string | null = null;
  let couponId: string | null = null;
  let coupon: Coupon | null = null;

  if (cart.couponCode && cart.couponCode.trim().length > 0) {
    const evaluation = await evaluateCoupon(service, {
      restaurantId: cart.restaurantId,
      code: cart.couponCode,
      subtotal,
    });
    if (!evaluation.valid || !evaluation.coupon) {
      throw new PricingError(
        evaluation.reason ?? 'Coupon is not valid.',
        'coupon_invalid',
      );
    }
    coupon = evaluation.coupon;
    couponCode = evaluation.coupon.code;
    couponId = evaluation.coupon.id;
  }

  // Resolve restaurant tax rate and currency authoritatively.
  const { data: restaurant, error: restaurantError } = await service
    .from('restaurants')
    .select('tax_rate')
    .eq('id', cart.restaurantId)
    .single();

  if (restaurantError) {
    throw new PricingError(restaurantError.message, 'restaurant_read_failed');
  }

  // Delivery fee applies only to delivery orders.
  const deliveryFee =
    cart.fulfillment === 'delivery' ? round2(Math.max(0, cart.deliveryFee ?? 0)) : 0;

  // Discount is computed from the coupon + the resolved subtotal/delivery.
  if (coupon) {
    discount = round2(
      computeDiscount(coupon, { subtotal, deliveryFee }),
    );
    // Never discount more than the discountable base.
    discount = Math.min(discount, round2(subtotal + deliveryFee));
  }

  // Tax is applied to the post-discount goods subtotal (delivery untaxed here).
  const taxableBase = Math.max(0, round2(subtotal - Math.min(discount, subtotal)));
  const tax = round2(taxableBase * Number(restaurant.tax_rate));

  const tip = round2(Math.max(0, cart.tip ?? 0));

  const total = round2(subtotal - discount + tax + deliveryFee + tip);
  if (total < 0) {
    throw new PricingError('Computed total is negative.', 'negative_total');
  }

  return {
    lines,
    breakdown: {
      subtotal,
      discount,
      tax,
      deliveryFee,
      tip,
      total,
      couponCode,
      couponId,
    },
  };
}

/** Converts a major-unit amount to Stripe minor units (cents). */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}
