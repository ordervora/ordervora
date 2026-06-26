/**
 * Cart domain types.
 *
 * A cart line references a product and the modifier OPTIONS chosen for it,
 * snapshotting display names and prices so the cart renders without re-fetching.
 * The server re-resolves all of this authoritatively at checkout — these values
 * exist for display and to build the checkout request, not as a price of record.
 */

/** A chosen modifier option on a cart line. */
export interface CartModifier {
  optionId: string;
  modifierId: string;
  name: string;
  priceDelta: number;
}

/** One line in the cart. `lineId` is a client id so duplicate products with
 *  different modifiers remain distinct entries. */
export interface CartLine {
  lineId: string;
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  imageUrl: string | null;
  modifiers: CartModifier[];
}

export type Fulfillment = 'pickup' | 'delivery';

/** A validated coupon held on the cart (from validate-coupon). */
export interface AppliedCoupon {
  code: string;
  discount: number;
}

/** The full cart state persisted per restaurant. */
export interface CartState {
  restaurantId: string;
  lines: CartLine[];
  fulfillment: Fulfillment;
  coupon: AppliedCoupon | null;
  tip: number;
  /** ISO timestamp for a scheduled order, or null for ASAP. */
  scheduledFor: string | null;
}
