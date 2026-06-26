/**
 * advance-order — move an order to a new state (staff-tier).
 *
 * Authorizes the caller as active staff of the order's restaurant, validates the
 * transition against the lifecycle rules, and applies it. The database trigger
 * logs the order_events row and stamps the lifecycle timestamp; the resulting
 * UPDATE fires the realtime event the KDS and tracker subscribe to. An audit
 * entry records who advanced the order.
 *
 * This exists as an Edge Function (rather than a direct client update) so the
 * transition is validated and audited centrally, and so future side effects of
 * specific transitions have one place to live.
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
import { isStaff, writeAudit } from '../_shared/auth.ts';
import type { Tables } from '../_shared/types.ts';

type OrderState = Tables<'orders'>['state'];

interface AdvanceRequest {
  orderId: string;
  toState: OrderState;
  note?: string;
}

/** Legal forward transitions, mirroring the order service's map. */
const ALLOWED: Record<OrderState, readonly OrderState[]> = {
  pending: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed', 'cancelled'],
  out_for_delivery: ['completed', 'cancelled'],
  completed: ['refunded'],
  cancelled: [],
  refunded: [],
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handlePreflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('Authentication required.', 401);

  let body: AdvanceRequest;
  try {
    body = (await req.json()) as AdvanceRequest;
  } catch {
    return errorResponse('Invalid JSON body.', 400);
  }

  if (!body.orderId || !body.toState) {
    return errorResponse('orderId and toState are required.', 400);
  }

  const service = serviceClient();

  const { data: order, error: orderError } = await service
    .from('orders')
    .select('id, restaurant_id, state, order_number')
    .eq('id', body.orderId)
    .single();

  if (orderError || !order) return errorResponse('Order not found.', 404);

  // Authorize: caller must be active staff of THIS restaurant (their RLS view).
  const authorized = await isStaff(userClient(req), order.restaurant_id, userId);
  if (!authorized) {
    return errorResponse('You do not have permission to update this order.', 403);
  }

  // Validate the transition.
  const currentState: OrderState = order.state;
  const allowedNext = ALLOWED[currentState];
  if (!allowedNext.includes(body.toState)) {
    return errorResponse(
      `Cannot move an order from "${currentState}" to "${body.toState}".`,
      409,
      'invalid_transition',
    );
  }

  // Apply it. The trigger logs the event and stamps the timestamp; the UPDATE
  // is what the KDS and customer tracker receive over realtime.
  const { data: updated, error: updateError } = await service
    .from('orders')
    .update({ state: body.toState })
    .eq('id', order.id)
    .select('*')
    .single();

  if (updateError || !updated) {
    return errorResponse(
      updateError?.message ?? 'Could not update the order.',
      500,
    );
  }

  await writeAudit(service, {
    restaurantId: order.restaurant_id,
    actorId: userId,
    action: 'order.advanced',
    entityType: 'order',
    entityId: order.id,
    metadata: {
      from: currentState,
      to: body.toState,
      order_number: order.order_number,
      note: body.note ?? null,
    },
  });

  return jsonResponse({
    orderId: updated.id,
    state: updated.state,
    orderNumber: updated.order_number,
  });
});
