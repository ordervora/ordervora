/**
 * checkout — create a paid order.
 *
 * Flow:
 *   1. Parse the proposed cart (references and intent only — never prices).
 *   2. Price it authoritatively with the pricing engine, the single source of
 *      truth for all money. The client's idea of the total is ignored.
 *   3. Persist the order + financials + items + modifiers atomically via the
 *      create_order_atomic RPC (one transaction).
 *   4. Create a Stripe PaymentIntent on the restaurant's connected account for
 *      the authoritative total, with the order id in metadata so the webhook can
 *      reconcile. Record a pending payment row and an audit entry.
 *   5. Return the order id/number and the PaymentIntent client_secret.
 *
 * The order is created in `pending`; the webhook moves it to `accepted` once
 * Stripe confirms payment, which is what fires the realtime event to the KDS.
 */

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  handlePreflight,
} from '../_shared/http.ts';
import { serviceClient, getUserId } from '../_shared/supabase.ts';
import { stripe, applicationFeeAmount } from '../_shared/stripe.ts';
import { writeAudit } from '../_shared/auth.ts';
import {
  priceCart,
  toMinorUnits,
  PricingError,
  type CartInput,
  type PricingResult,
} from '../_shared/pricing.ts';

interface CheckoutRequest {
  cart: CartInput;
  customer?: {
    id?: string | null;
    name?: string | null;
    phone?: string | null;
  };
  address?: string | null;
  note?: string | null;
  channel?: string;
}

interface AtomicPayload {
  restaurant_id: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  fulfillment: 'pickup' | 'delivery';
  channel: string;
  address: string | null;
  note: string | null;
  is_vip: boolean;
  eta_minutes: number | null;
  financials: {
    subtotal: number;
    discount: number;
    tax: number;
    delivery_fee: number;
    tip: number;
    total: number;
    coupon_code: string | null;
  };
  items: {
    product_id: string | null;
    name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
    modifiers: { name: string; price_delta: number }[];
  }[];
}

function buildAtomicPayload(
  body: CheckoutRequest,
  pricing: PricingResult,
): AtomicPayload {
  return {
    restaurant_id: body.cart.restaurantId,
    customer_id: body.customer?.id ?? null,
    customer_name: body.customer?.name ?? null,
    customer_phone: body.customer?.phone ?? null,
    fulfillment: body.cart.fulfillment,
    channel: body.channel ?? 'web',
    address: body.address ?? null,
    note: body.note ?? null,
    is_vip: false,
    eta_minutes: null,
    financials: {
      subtotal: pricing.breakdown.subtotal,
      discount: pricing.breakdown.discount,
      tax: pricing.breakdown.tax,
      delivery_fee: pricing.breakdown.deliveryFee,
      tip: pricing.breakdown.tip,
      total: pricing.breakdown.total,
      coupon_code: pricing.breakdown.couponCode,
    },
    items: pricing.lines.map((line) => ({
      product_id: line.productId,
      name: line.name,
      unit_price: line.unitPrice,
      quantity: line.quantity,
      line_total: line.lineTotal,
      modifiers: line.modifiers.map((m) => ({
        name: m.name,
        price_delta: m.priceDelta,
      })),
    })),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handlePreflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  // Authentication: a signed-in user (or guest with a valid anon token) is
  // required. Guests checking out still carry a Supabase anon session.
  const userId = await getUserId(req);
  if (!userId) return errorResponse('Authentication required.', 401);

  let body: CheckoutRequest;
  try {
    body = (await req.json()) as CheckoutRequest;
  } catch {
    return errorResponse('Invalid JSON body.', 400);
  }

  if (!body.cart || !body.cart.restaurantId || !Array.isArray(body.cart.lines)) {
    return errorResponse('A cart with restaurantId and lines is required.', 400);
  }

  const service = serviceClient();

  // 1 + 2. Authoritative pricing. The client never sets a price we trust.
  let pricing: PricingResult;
  try {
    pricing = await priceCart(service, body.cart);
  } catch (error) {
    if (error instanceof PricingError) {
      return errorResponse(error.message, 422, error.code);
    }
    return errorResponse('Could not price the cart.', 500);
  }

  // Resolve the restaurant's Stripe connected account + currency.
  const { data: restaurant, error: restaurantError } = await service
    .from('restaurants')
    .select('stripe_account_id, stripe_charges_enabled, currency, is_active')
    .eq('id', body.cart.restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return errorResponse('Restaurant not found.', 404);
  }
  if (!restaurant.is_active) {
    return errorResponse('This restaurant is not accepting orders.', 409);
  }
  if (!restaurant.stripe_account_id || !restaurant.stripe_charges_enabled) {
    return errorResponse(
      'This restaurant has not finished payment setup.',
      409,
      'stripe_account_missing',
    );
  }

  // 3. Atomic persistence of the order and all child rows.
  const payload = buildAtomicPayload(body, pricing);
  const { data: created, error: rpcError } = await service.rpc(
    'create_order_atomic',
    { payload: payload as unknown as Record<string, never> },
  );

  if (rpcError || !created || created.length === 0) {
    return errorResponse(
      rpcError?.message ?? 'Could not create the order.',
      500,
      'order_create_failed',
    );
  }

  const orderId = created[0].order_id;
  const orderNumber = created[0].order_number;

  // 4. Stripe PaymentIntent on the connected account for the authoritative total.
  const currency = restaurant.currency.toLowerCase();
  const amountMinor = toMinorUnits(pricing.breakdown.total);
  const feeMinor = applicationFeeAmount(amountMinor);

  let clientSecret: string | null = null;
  let paymentIntentId: string | null = null;

  try {
    const intent = await stripe.paymentIntents.create(
      {
        amount: amountMinor,
        currency,
        metadata: {
          order_id: orderId,
          restaurant_id: body.cart.restaurantId,
        },
        ...(feeMinor > 0 ? { application_fee_amount: feeMinor } : {}),
        automatic_payment_methods: { enabled: true },
      },
      { stripeAccount: restaurant.stripe_account_id },
    );
    clientSecret = intent.client_secret;
    paymentIntentId = intent.id;
  } catch (error) {
    // The order exists but payment could not be initialized; cancel it so it
    // never reaches the kitchen, and surface the failure.
    await service
      .from('orders')
      .update({ state: 'cancelled' })
      .eq('id', orderId);

    const message =
      error instanceof Error ? error.message : 'Payment could not be started.';
    return errorResponse(message, 502, 'stripe_intent_failed');
  }

  // Record the pending payment row (manager-tier surface; written by service).
  await service.from('payments').insert({
    restaurant_id: body.cart.restaurantId,
    order_id: orderId,
    provider: 'stripe',
    status: 'pending',
    amount: pricing.breakdown.total,
    platform_fee: feeMinor / 100,
    currency: restaurant.currency,
    stripe_payment_intent: paymentIntentId,
  });

  await writeAudit(service, {
    restaurantId: body.cart.restaurantId,
    actorId: userId,
    action: 'order.created',
    entityType: 'order',
    entityId: orderId,
    metadata: {
      order_number: orderNumber,
      total: pricing.breakdown.total,
      coupon_code: pricing.breakdown.couponCode,
    },
  });

  return jsonResponse({
    orderId,
    orderNumber,
    clientSecret,
    amount: pricing.breakdown.total,
    currency: restaurant.currency,
    breakdown: pricing.breakdown,
  });
});

export { corsHeaders };
