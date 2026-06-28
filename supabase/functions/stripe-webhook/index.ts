/**
 * stripe-webhook — process Stripe Connect payment events.
 *
 * Verifies the webhook signature, then reconciles the order:
 *   payment_intent.succeeded
 *     → payment row to 'paid', order 'pending' → 'accepted' (fires the realtime
 *       event that lands the ticket on the KDS), record coupon redemption,
 *       award loyalty points, notify, audit.
 *   payment_intent.payment_failed
 *     → payment row to 'failed', order → 'cancelled', audit.
 *   account.updated
 *     → reconciles stripe_charges_enabled/stripe_details_submitted on the
 *       restaurant whose Connect account this is, so the dashboard and the
 *       checkout gate know onboarding actually finished (not just started).
 *
 * All writes use the service client because this runs as the system, not a
 * user. The order-acceptance UPDATE is what the KDS subscribes to, so the
 * realtime fan-out is a side effect of this state change.
 */

import { errorResponse } from '../_shared/http.ts';
import { serviceClient, type Client } from '../_shared/supabase.ts';
import { stripe } from '../_shared/stripe.ts';
import { writeAudit, writeNotification } from '../_shared/auth.ts';
import type Stripe from 'stripe';

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

if (!WEBHOOK_SECRET) {
  throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable.');
}

/** Loyalty: points earned per whole currency unit of subtotal. */
const POINTS_PER_UNIT = Number(Deno.env.get('LOYALTY_POINTS_PER_UNIT') ?? '1');

async function handleSucceeded(
  service: Client,
  intent: Stripe.PaymentIntent,
): Promise<void> {
  const orderId = intent.metadata.order_id;
  const restaurantId = intent.metadata.restaurant_id;
  if (!orderId || !restaurantId) return;

  // Mark the payment paid (idempotent on the payment intent id).
  await service
    .from('payments')
    .update({
      status: 'paid',
      stripe_charge_id:
        typeof intent.latest_charge === 'string' ? intent.latest_charge : null,
    })
    .eq('stripe_payment_intent', intent.id);

  // Move the order from pending → accepted. Guard on current state so a
  // duplicate webhook delivery does not re-trigger downstream effects.
  const { data: order } = await service
    .from('orders')
    .select('id, state, customer_id, order_number')
    .eq('id', orderId)
    .single();

  if (!order || order.state !== 'pending') {
    // Already processed or in an unexpected state; stop without side effects.
    return;
  }

  await service.from('orders').update({ state: 'accepted' }).eq('id', orderId);

  // Read financials (service-role) to drive redemption + loyalty amounts.
  const { data: financials } = await service
    .from('order_financials')
    .select('subtotal, coupon_code')
    .eq('order_id', orderId)
    .maybeSingle();

  // Record coupon redemption if one was applied.
  if (financials?.coupon_code) {
    const { data: coupon } = await service
      .from('coupons')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('code', financials.coupon_code)
      .maybeSingle();

    if (coupon) {
      const { data: fin } = await service
        .from('order_financials')
        .select('discount')
        .eq('order_id', orderId)
        .maybeSingle();

      // uses_count is reconciled by the redemption trigger.
      await service.from('coupon_redemptions').insert({
        restaurant_id: restaurantId,
        coupon_id: coupon.id,
        order_id: orderId,
        customer_id: order.customer_id,
        amount_discounted: fin?.discount ?? 0,
      });
    }
  }

  // Award loyalty points to a known customer (ledger; cache synced by trigger).
  if (order.customer_id && financials) {
    const points = Math.floor(Number(financials.subtotal) * POINTS_PER_UNIT);
    if (points > 0) {
      await service.from('loyalty_points').insert({
        restaurant_id: restaurantId,
        customer_id: order.customer_id,
        order_id: orderId,
        points_delta: points,
        reason: 'earned',
        note: `Order #${order.order_number}`,
      });

      await service
        .from('customers')
        .update({ last_order_at: new Date().toISOString() })
        .eq('id', order.customer_id);
    }
  }

  await writeNotification(service, {
    restaurantId,
    orderId,
    title: 'New order',
    body: `Order #${order.order_number} is paid and ready to prepare.`,
    channel: 'sound',
  });

  await writeAudit(service, {
    restaurantId,
    actorId: null,
    action: 'payment.succeeded',
    entityType: 'order',
    entityId: orderId,
    metadata: { payment_intent: intent.id },
  });
}

async function handleFailed(
  service: Client,
  intent: Stripe.PaymentIntent,
): Promise<void> {
  const orderId = intent.metadata.order_id;
  const restaurantId = intent.metadata.restaurant_id;
  if (!orderId || !restaurantId) return;

  await service
    .from('payments')
    .update({
      status: 'failed',
      failure_reason:
        intent.last_payment_error?.message ?? 'Payment failed.',
    })
    .eq('stripe_payment_intent', intent.id);

  const { data: order } = await service
    .from('orders')
    .select('state')
    .eq('id', orderId)
    .single();

  // Only cancel an order still awaiting payment.
  if (order && order.state === 'pending') {
    await service.from('orders').update({ state: 'cancelled' }).eq('id', orderId);
  }

  await writeAudit(service, {
    restaurantId,
    actorId: null,
    action: 'payment.failed',
    entityType: 'order',
    entityId: orderId,
    metadata: {
      payment_intent: intent.id,
      reason: intent.last_payment_error?.message ?? null,
    },
  });
}

async function handleAccountUpdated(
  service: Client,
  account: Stripe.Account,
): Promise<void> {
  const { data: restaurant } = await service
    .from('restaurants')
    .select('id')
    .eq('stripe_account_id', account.id)
    .maybeSingle();

  if (!restaurant) return;

  await service
    .from('restaurants')
    .update({
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_details_submitted: Boolean(account.details_submitted),
    })
    .eq('id', restaurant.id);

  await writeAudit(service, {
    restaurantId: restaurant.id,
    actorId: null,
    action: 'stripe.account_updated',
    entityType: 'restaurant',
    entityId: restaurant.id,
    metadata: {
      stripe_account_id: account.id,
      charges_enabled: account.charges_enabled,
      details_submitted: account.details_submitted,
    },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  const signature = req.headers.get('stripe-signature');
  if (!signature) return errorResponse('Missing stripe-signature header.', 400);

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      WEBHOOK_SECRET,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Signature verification failed.';
    return errorResponse(message, 400, 'invalid_signature');
  }

  const service = serviceClient();

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handleSucceeded(service, event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await handleFailed(service, event.data.object as Stripe.PaymentIntent);
        break;
      case 'account.updated':
        await handleAccountUpdated(service, event.data.object as Stripe.Account);
        break;
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Webhook processing failed.';
    return errorResponse(message, 500, 'webhook_processing_failed');
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
