/**
 * refund-order — issue a refund (manager-tier).
 *
 * Authorizes the caller as owner/manager of the order's restaurant, issues a
 * Stripe refund on the connected account for the order's payment, updates the
 * payment and order state, notifies, and audits. Supports full or partial
 * refunds; a partial refund marks the payment 'partially_refunded' and leaves
 * the order in its current state, while a full refund moves the order to
 * 'refunded'.
 */

import {
  errorResponse,
  jsonResponse,
  handlePreflight,
} from '../_shared/http.ts';
import {
  serviceClient,
  userClient,
  getUserId,
} from '../_shared/supabase.ts';
import { stripe } from '../_shared/stripe.ts';
import { isManager, writeAudit, writeNotification } from '../_shared/auth.ts';

interface RefundRequest {
  orderId: string;
  /** Optional partial amount in major units; omit for a full refund. */
  amount?: number;
  reason?: string;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handlePreflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('Authentication required.', 401);

  let body: RefundRequest;
  try {
    body = (await req.json()) as RefundRequest;
  } catch {
    return errorResponse('Invalid JSON body.', 400);
  }

  if (!body.orderId) return errorResponse('orderId is required.', 400);

  const service = serviceClient();

  // Resolve the order's restaurant + Stripe account and the payment.
  const { data: order, error: orderError } = await service
    .from('orders')
    .select('id, restaurant_id, order_number, state')
    .eq('id', body.orderId)
    .single();

  if (orderError || !order) return errorResponse('Order not found.', 404);

  // Authorize: the caller must be manager/owner of THIS restaurant (RLS view).
  const authorized = await isManager(
    userClient(req),
    order.restaurant_id,
    userId,
  );
  if (!authorized) {
    return errorResponse('You do not have permission to refund this order.', 403);
  }

  const { data: payment, error: paymentError } = await service
    .from('payments')
    .select('id, amount, amount_refunded, status, stripe_payment_intent, currency')
    .eq('order_id', body.orderId)
    .eq('provider', 'stripe')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paymentError || !payment) {
    return errorResponse('No payment found for this order.', 404);
  }
  if (payment.status === 'refunded') {
    return errorResponse('This order has already been fully refunded.', 409);
  }
  if (!payment.stripe_payment_intent) {
    return errorResponse('This payment cannot be refunded.', 409);
  }

  const { data: restaurant } = await service
    .from('restaurants')
    .select('stripe_account_id')
    .eq('id', order.restaurant_id)
    .single();

  if (!restaurant?.stripe_account_id) {
    return errorResponse('Restaurant payment account is not configured.', 409);
  }

  const alreadyRefunded = Number(payment.amount_refunded);
  const paidAmount = Number(payment.amount);
  const remaining = round2(paidAmount - alreadyRefunded);

  const refundAmount =
    body.amount === undefined ? remaining : round2(Math.max(0, body.amount));

  if (refundAmount <= 0) {
    return errorResponse('Refund amount must be greater than zero.', 400);
  }
  if (refundAmount > remaining) {
    return errorResponse(
      `Refund amount exceeds the refundable balance (${remaining.toFixed(2)}).`,
      400,
    );
  }

  // Issue the Stripe refund on the connected account.
  try {
    await stripe.refunds.create(
      {
        payment_intent: payment.stripe_payment_intent,
        amount: Math.round(refundAmount * 100),
        ...(body.reason ? { metadata: { reason: body.reason } } : {}),
      },
      { stripeAccount: restaurant.stripe_account_id },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Refund could not be processed.';
    return errorResponse(message, 502, 'stripe_refund_failed');
  }

  const newRefundedTotal = round2(alreadyRefunded + refundAmount);
  const isFullRefund = newRefundedTotal >= paidAmount;

  await service
    .from('payments')
    .update({
      amount_refunded: newRefundedTotal,
      status: isFullRefund ? 'refunded' : 'partially_refunded',
    })
    .eq('id', payment.id);

  // A full refund moves the order to the refunded terminal state.
  if (isFullRefund) {
    await service.from('orders').update({ state: 'refunded' }).eq('id', order.id);
  }

  await writeNotification(service, {
    restaurantId: order.restaurant_id,
    orderId: order.id,
    title: isFullRefund ? 'Order refunded' : 'Partial refund issued',
    body: `Order #${order.order_number}: ${refundAmount.toFixed(2)} refunded.`,
  });

  await writeAudit(service, {
    restaurantId: order.restaurant_id,
    actorId: userId,
    action: isFullRefund ? 'order.refunded' : 'order.partially_refunded',
    entityType: 'order',
    entityId: order.id,
    metadata: {
      amount: refundAmount,
      total_refunded: newRefundedTotal,
      reason: body.reason ?? null,
    },
  });

  return jsonResponse({
    orderId: order.id,
    refunded: refundAmount,
    totalRefunded: newRefundedTotal,
    fullyRefunded: isFullRefund,
  });
});
