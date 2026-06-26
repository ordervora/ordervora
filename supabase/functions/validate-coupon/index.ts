/**
 * validate-coupon — authoritative coupon check.
 *
 * Used by the customer app to validate a code before checkout. Runs the exact
 * same evaluation the pricing engine applies at checkout (shared coupon module),
 * including the per-customer redemption limit when a customer id is supplied.
 * Returns the computed discount preview alongside validity so the UI can show
 * the savings, but the checkout function re-evaluates authoritatively — this
 * endpoint is advisory, never the final gate.
 */

import {
  errorResponse,
  jsonResponse,
  handlePreflight,
} from '../_shared/http.ts';
import { serviceClient, getUserId } from '../_shared/supabase.ts';
import { evaluateCoupon, computeDiscount } from '../_shared/coupon.ts';

interface ValidateRequest {
  restaurantId: string;
  code: string;
  subtotal: number;
  deliveryFee?: number;
  customerId?: string | null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handlePreflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  // A valid session (including anon guest) is required to probe coupons.
  const userId = await getUserId(req);
  if (!userId) return errorResponse('Authentication required.', 401);

  let body: ValidateRequest;
  try {
    body = (await req.json()) as ValidateRequest;
  } catch {
    return errorResponse('Invalid JSON body.', 400);
  }

  if (!body.restaurantId || !body.code || typeof body.subtotal !== 'number') {
    return errorResponse(
      'restaurantId, code, and subtotal are required.',
      400,
    );
  }

  const service = serviceClient();

  const evaluation = await evaluateCoupon(service, {
    restaurantId: body.restaurantId,
    code: body.code,
    subtotal: body.subtotal,
    customerId: body.customerId ?? null,
  });

  if (!evaluation.valid || !evaluation.coupon) {
    return jsonResponse({
      valid: false,
      reason: evaluation.reason,
      discount: 0,
    });
  }

  const discount = computeDiscount(evaluation.coupon, {
    subtotal: body.subtotal,
    deliveryFee: Math.max(0, body.deliveryFee ?? 0),
  });

  return jsonResponse({
    valid: true,
    reason: null,
    discount: Math.min(discount, body.subtotal + Math.max(0, body.deliveryFee ?? 0)),
    coupon: {
      code: evaluation.coupon.code,
      type: evaluation.coupon.type,
      value: evaluation.coupon.value,
    },
  });
});
