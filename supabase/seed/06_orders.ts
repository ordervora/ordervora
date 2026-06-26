/**
 * Seed 06 — sample orders.
 *
 * Builds a spread of orders that exercises every surface:
 *   - Live KDS board: orders in `accepted`, `preparing`, and `ready` (one VIP,
 *     one delivery, several pickup) so all three columns and the VIP/priority
 *     treatments render immediately.
 *   - Customer tracking: the active orders above belong to seeded customers and
 *     carry an event timeline so the tracker shows progress.
 *   - History + loyalty: several `completed` orders in the past, each with a
 *     loyalty ledger entry, so order history and points have data.
 *   - One `cancelled` order to cover the terminal/dead path.
 *
 * Each order writes the full operational + financial split: orders,
 * order_financials, order_items, order_item_financials, order_item_modifiers,
 * order_item_modifier_financials, and an append-only order_events timeline.
 * Loyalty entries are inserted for completed orders. All scoped by restaurant_id.
 *
 * Idempotent: this restaurant's orders are cleared before reinsert (cascades
 * remove items, financials, modifiers, and events).
 */

import { type SeedClient, unwrap, logStep, minutesAgo } from './_shared';
import type { SeededMenu } from './03_menu';
import type { SeededCustomers } from './04_customers';

type OrderState =
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

interface LineSpec {
  product: string;
  quantity: number;
  options: string[];
}

interface OrderSpec {
  customerName: string | null;
  customerLabel: string;
  phone: string;
  fulfillment: 'pickup' | 'delivery';
  state: OrderState;
  isVip: boolean;
  note: string | null;
  address: string | null;
  placedMinutesAgo: number;
  tip: number;
  couponCode: string | null;
  discount: number;
  lines: LineSpec[];
}

const TAX_RATE = 0.0825;
const DELIVERY_FEE = 3.99;

const ORDERS: OrderSpec[] = [
  // --- Live KDS: WAITING (accepted) ---
  {
    customerName: 'Jordan Blake',
    customerLabel: 'Jordan B.',
    phone: '+1-555-0191',
    fulfillment: 'pickup',
    state: 'accepted',
    isVip: true,
    note: 'Extra napkins please.',
    address: null,
    placedMinutesAgo: 3,
    tip: 2.0,
    couponCode: null,
    discount: 0,
    lines: [
      { product: 'Italian Combo', quantity: 1, options: ['Hero roll', 'Extra cheese'] },
      { product: 'Hand-Cut Fries', quantity: 1, options: ['Medium size'] },
    ],
  },
  {
    customerName: 'Eli Rosen',
    customerLabel: 'Eli R.',
    phone: '+1-555-0176',
    fulfillment: 'delivery',
    state: 'accepted',
    isVip: false,
    note: 'Leave at the door, buzzer 4B.',
    address: '210 Oak Street, Apt 4B, Springfield',
    placedMinutesAgo: 6,
    tip: 3.5,
    couponCode: 'FREESHIP',
    discount: 3.99,
    lines: [
      { product: 'Double Stack', quantity: 1, options: ['Medium well', 'Bacon'] },
      { product: 'House Lemonade', quantity: 1, options: ['Large size'] },
    ],
  },
  // --- Live KDS: PREPARING ---
  {
    customerName: 'Amara Singh',
    customerLabel: 'Amara S.',
    phone: '+1-555-0184',
    fulfillment: 'pickup',
    state: 'preparing',
    isVip: false,
    note: null,
    address: null,
    placedMinutesAgo: 9,
    tip: 1.5,
    couponCode: null,
    discount: 0,
    lines: [
      { product: 'Classic Smash', quantity: 2, options: ['Medium', 'No onions'] },
      { product: 'Mac & Cheese', quantity: 1, options: ['Small size'] },
    ],
  },
  {
    customerName: null,
    customerLabel: 'Walk-in',
    phone: '+1-555-0100',
    fulfillment: 'pickup',
    state: 'preparing',
    isVip: false,
    note: 'Allergy: no nuts.',
    address: null,
    placedMinutesAgo: 12,
    tip: 0,
    couponCode: null,
    discount: 0,
    lines: [
      { product: 'Avocado Toast', quantity: 1, options: ['Avocado'] },
      { product: 'Iced Latte', quantity: 1, options: ['Oat', 'Medium size'] },
    ],
  },
  // --- Live KDS: READY ---
  {
    customerName: 'Nina Costa',
    customerLabel: 'Nina C.',
    phone: '+1-555-0168',
    fulfillment: 'pickup',
    state: 'ready',
    isVip: false,
    note: null,
    address: null,
    placedMinutesAgo: 16,
    tip: 2.25,
    couponCode: 'WELCOME10',
    discount: 1.4,
    lines: [
      { product: 'Turkey Club', quantity: 1, options: ['Whole wheat', 'Add combo'] },
    ],
  },
  // --- Completed (history + loyalty) ---
  {
    customerName: 'Jordan Blake',
    customerLabel: 'Jordan B.',
    phone: '+1-555-0191',
    fulfillment: 'pickup',
    state: 'completed',
    isVip: true,
    note: null,
    address: null,
    placedMinutesAgo: 1440,
    tip: 3.0,
    couponCode: null,
    discount: 0,
    lines: [
      { product: 'Double Stack', quantity: 1, options: ['Well done', 'Extra patty'] },
      { product: 'Hand-Cut Fries', quantity: 1, options: ['Large size'] },
    ],
  },
  {
    customerName: 'Amara Singh',
    customerLabel: 'Amara S.',
    phone: '+1-555-0184',
    fulfillment: 'delivery',
    state: 'completed',
    isVip: false,
    note: null,
    address: '900 Birch Avenue, Apt 5, Springfield',
    placedMinutesAgo: 2880,
    tip: 4.0,
    couponCode: 'SAVE5',
    discount: 5.0,
    lines: [
      { product: 'Italian Combo', quantity: 2, options: ['Ciabatta'] },
      { product: 'House Lemonade', quantity: 2, options: ['Medium size'] },
    ],
  },
  {
    customerName: 'Eli Rosen',
    customerLabel: 'Eli R.',
    phone: '+1-555-0176',
    fulfillment: 'pickup',
    state: 'completed',
    isVip: false,
    note: null,
    address: null,
    placedMinutesAgo: 4320,
    tip: 1.0,
    couponCode: null,
    discount: 0,
    lines: [
      { product: 'Breakfast Burrito', quantity: 1, options: ['Bacon'] },
      { product: 'Iced Latte', quantity: 1, options: ['Whole', 'Small size'] },
    ],
  },
  // --- Cancelled (terminal/dead path) ---
  {
    customerName: 'Nina Costa',
    customerLabel: 'Nina C.',
    phone: '+1-555-0168',
    fulfillment: 'pickup',
    state: 'cancelled',
    isVip: false,
    note: 'Customer cancelled before prep.',
    address: null,
    placedMinutesAgo: 180,
    tip: 0,
    couponCode: null,
    discount: 0,
    lines: [{ product: 'Caprese Press', quantity: 1, options: ['Ciabatta'] }],
  },
];

/** The state path an order passed through to reach its current state. */
const STATE_PATH: Record<OrderState, OrderState[]> = {
  accepted: ['accepted'],
  preparing: ['accepted', 'preparing'],
  ready: ['accepted', 'preparing', 'ready'],
  out_for_delivery: ['accepted', 'preparing', 'ready', 'out_for_delivery'],
  completed: ['accepted', 'preparing', 'ready', 'completed'],
  cancelled: ['accepted', 'cancelled'],
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface SeededOrders {
  count: number;
}

export async function seedOrders(
  client: SeedClient,
  restaurantId: string,
  menu: SeededMenu,
  customers: SeededCustomers,
): Promise<SeededOrders> {
  logStep('Sample orders (items, financials, events)');

  await client.from('orders').delete().eq('restaurant_id', restaurantId);

  let created = 0;

  for (const spec of ORDERS) {
    // Resolve priced lines from the seeded menu.
    const resolvedLines = spec.lines.map((line) => {
      const product = menu.productByName[line.product];
      if (!product) {
        throw new Error(`Seed order references unknown product "${line.product}".`);
      }
      const modifiers = line.options.map((optionName) => {
        const option = menu.optionByName[optionName];
        if (!option) {
          throw new Error(`Seed order references unknown option "${optionName}".`);
        }
        return { name: optionName, priceDelta: option.priceDelta };
      });
      const modifierSum = modifiers.reduce((sum, m) => sum + m.priceDelta, 0);
      const unitPrice = product.price;
      const lineTotal = round2((unitPrice + modifierSum) * line.quantity);
      return {
        productId: product.id,
        name: line.product,
        unitPrice,
        quantity: line.quantity,
        modifiers,
        lineTotal,
      };
    });

    const subtotal = round2(
      resolvedLines.reduce((sum, l) => sum + l.lineTotal, 0),
    );
    const deliveryFee = spec.fulfillment === 'delivery' ? DELIVERY_FEE : 0;
    const discount = round2(Math.min(spec.discount, subtotal + deliveryFee));
    const taxableBase = Math.max(0, round2(subtotal - Math.min(discount, subtotal)));
    const tax = round2(taxableBase * TAX_RATE);
    const tip = round2(spec.tip);
    const total = round2(subtotal - discount + tax + deliveryFee + tip);

    const placedAt = minutesAgo(spec.placedMinutesAgo);
    const path = STATE_PATH[spec.state];

    // Lifecycle timestamps derived from the placement time, spaced a few minutes.
    const stamps: Partial<Record<OrderState, string>> = {};
    path.forEach((state, index) => {
      stamps[state] = minutesAgo(spec.placedMinutesAgo - index * 3);
    });

    const customerId = spec.customerName
      ? customers.byName[spec.customerName] ?? null
      : null;

    // 1. order
    const order = unwrap(
      await client
        .from('orders')
        .insert({
          restaurant_id: restaurantId,
          customer_id: customerId,
          customer_name: spec.customerLabel,
          customer_phone: spec.phone,
          fulfillment: spec.fulfillment,
          state: spec.state,
          channel: 'web',
          address: spec.address,
          note: spec.note,
          is_vip: spec.isVip,
          eta_minutes: spec.state === 'completed' || spec.state === 'cancelled' ? null : 15,
          placed_at: placedAt,
          accepted_at: stamps.accepted ?? null,
          started_at: stamps.preparing ?? null,
          ready_at: stamps.ready ?? null,
          completed_at: stamps.completed ?? null,
        })
        .select('id, order_number')
        .single(),
    );

    // 2. financials (1:1)
    unwrap(
      await client
        .from('order_financials')
        .insert({
          order_id: order.id,
          restaurant_id: restaurantId,
          subtotal,
          discount,
          tax,
          delivery_fee: deliveryFee,
          tip,
          total,
          coupon_code: spec.couponCode,
        })
        .select('order_id')
        .single(),
    );

    // 3. items + item financials + modifiers + modifier financials
    for (const line of resolvedLines) {
      const item = unwrap(
        await client
          .from('order_items')
          .insert({
            restaurant_id: restaurantId,
            order_id: order.id,
            product_id: line.productId,
            name_snapshot: line.name,
            quantity: line.quantity,
          })
          .select('id')
          .single(),
      );

      unwrap(
        await client
          .from('order_item_financials')
          .insert({
            order_item_id: item.id,
            restaurant_id: restaurantId,
            price_snapshot: line.unitPrice,
            line_total: line.lineTotal,
          })
          .select('order_item_id')
          .single(),
      );

      for (const modifier of line.modifiers) {
        const modRow = unwrap(
          await client
            .from('order_item_modifiers')
            .insert({
              restaurant_id: restaurantId,
              order_item_id: item.id,
              modifier_name_snapshot: modifier.name,
            })
            .select('id')
            .single(),
        );

        unwrap(
          await client
            .from('order_item_modifier_financials')
            .insert({
              order_item_modifier_id: modRow.id,
              restaurant_id: restaurantId,
              price_snapshot: modifier.priceDelta,
            })
            .select('order_item_modifier_id')
            .single(),
        );
      }
    }

    // 4. event timeline (append-only). Insert one event per state in the path.
    // The order rows were inserted already-advanced, so we record the history
    // explicitly here as system events with the derived timestamps.
    let previous: OrderState | null = null;
    for (const state of path) {
      unwrap(
        await client
          .from('order_events')
          .insert({
            restaurant_id: restaurantId,
            order_id: order.id,
            from_state: previous,
            to_state: state,
            actor_type: 'system',
            actor_id: null,
            note: null,
            created_at: stamps[state] ?? placedAt,
          })
          .select('id')
          .single(),
      );
      previous = state;
    }

    // 5. loyalty for completed orders with a known customer (1 pt per $1 subtotal)
    if (spec.state === 'completed' && customerId) {
      const points = Math.floor(subtotal);
      if (points > 0) {
        unwrap(
          await client
            .from('loyalty_points')
            .insert({
              restaurant_id: restaurantId,
              customer_id: customerId,
              order_id: order.id,
              points_delta: points,
              reason: 'earned',
              note: `Order #${order.order_number}`,
            })
            .select('id')
            .single(),
        );
      }
    }

    created += 1;
    logStep(`  → #${order.order_number} ${spec.state} (${spec.customerLabel})`);
  }

  return { count: created };
}
