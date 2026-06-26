'use client';

/**
 * Dashboard order actions — calls the Phase 3 Edge Functions.
 *
 * Refunds go through refund-order (manager-tier, Stripe refund + state update).
 * State changes (including cancel) go through advance-order (validated, audited).
 * Both authorize the caller server-side via their own RLS membership, so the UI
 * gating here is convenience only.
 */

import { getBrowserClient } from '@/lib/supabase/client';
import { clientEnv } from '@/config/env';
import type { OrderState } from '@/config/constants';

async function authHeader(): Promise<string> {
  const client = getBrowserClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  return `Bearer ${session?.access_token ?? clientEnv.supabaseAnonKey}`;
}

function fnUrl(name: string): string {
  return `${clientEnv.supabaseUrl}/functions/v1/${name}`;
}

export interface ActionResult {
  ok: boolean;
  error: string | null;
}

/** Refund an order, optionally a partial amount in major units. */
export async function refundOrder(
  orderId: string,
  amount?: number,
  reason?: string,
): Promise<ActionResult> {
  const response = await fetch(fnUrl('refund-order'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify({ orderId, amount, reason }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return { ok: false, error: body?.error?.message ?? 'Refund failed.' };
  }
  return { ok: true, error: null };
}

/** Advance an order to a new state (also used to cancel). */
export async function advanceOrder(
  orderId: string,
  toState: OrderState,
): Promise<ActionResult> {
  const response = await fetch(fnUrl('advance-order'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify({ orderId, toState }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return { ok: false, error: body?.error?.message ?? 'Update failed.' };
  }
  return { ok: true, error: null };
}
