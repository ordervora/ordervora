'use client';

/**
 * Checkout client — talks to the Phase 3 Edge Functions.
 *
 * Wraps the `validate-coupon` and `checkout` functions with typed calls. The
 * cart sends references only (product ids, modifier option ids, quantities); the
 * server prices authoritatively and returns the order plus a Stripe client
 * secret. This module never computes a price it expects the server to trust.
 */

import { getBrowserClient } from '@/lib/supabase/client';
import { clientEnv } from '@/config/env';
import type { CartState } from './types';

async function authHeader(): Promise<string> {
  const client = getBrowserClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  return `Bearer ${session?.access_token ?? clientEnv.supabaseAnonKey}`;
}

function functionsUrl(name: string): string {
  return `${clientEnv.supabaseUrl}/functions/v1/${name}`;
}

export interface CouponPreview {
  valid: boolean;
  reason: string | null;
  discount: number;
}

/** Validates a coupon code for the current cart subtotal. */
export async function validateCoupon(input: {
  restaurantId: string;
  code: string;
  subtotal: number;
  deliveryFee: number;
  customerId: string | null;
}): Promise<CouponPreview> {
  const response = await fetch(functionsUrl('validate-coupon'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return {
      valid: false,
      reason: body?.error?.message ?? 'Could not validate the code.',
      discount: 0,
    };
  }

  return (await response.json()) as CouponPreview;
}

export interface CheckoutResult {
  ok: boolean;
  orderId?: string;
  orderNumber?: number;
  clientSecret?: string | null;
  total?: number;
  currency?: string;
  error?: string;
}

export interface CheckoutCustomer {
  id: string | null;
  name: string | null;
  phone: string | null;
}

/** Submits the cart to the checkout function and returns the order + intent. */
export async function submitCheckout(input: {
  cart: CartState;
  customer: CheckoutCustomer;
  address: string | null;
  note: string | null;
  deliveryFee: number;
}): Promise<CheckoutResult> {
  const body = {
    cart: {
      restaurantId: input.cart.restaurantId,
      fulfillment: input.cart.fulfillment,
      lines: input.cart.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        modifierOptionIds: line.modifiers.map((m) => m.optionId),
      })),
      couponCode: input.cart.coupon?.code ?? null,
      tip: input.cart.tip,
      deliveryFee: input.deliveryFee,
    },
    customer: input.customer,
    address: input.address,
    note: input.note,
    channel: 'web',
  };

  const response = await fetch(functionsUrl('checkout'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return {
      ok: false,
      error: errorBody?.error?.message ?? 'Checkout failed. Please try again.',
    };
  }

  const data = (await response.json()) as {
    orderId: string;
    orderNumber: number;
    clientSecret: string | null;
    amount: number;
    currency: string;
  };

  return {
    ok: true,
    orderId: data.orderId,
    orderNumber: data.orderNumber,
    clientSecret: data.clientSecret,
    total: data.amount,
    currency: data.currency,
  };
}
