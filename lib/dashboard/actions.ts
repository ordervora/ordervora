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

export interface ConnectStripeResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Starts (or resumes) Stripe Connect onboarding for a restaurant. Returns a
 * Stripe-hosted URL the caller should redirect the browser to; Stripe sends
 * the owner back to `returnUrl`/`refreshUrl` when they finish or bail out.
 */
export async function connectStripe(
  restaurantId: string,
  returnUrl: string,
  refreshUrl: string,
): Promise<ConnectStripeResult> {
  const response = await fetch(fnUrl('stripe-connect'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify({
      restaurant_id: restaurantId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return {
      ok: false,
      error: body?.error?.message ?? 'Could not start Stripe onboarding.',
    };
  }
  const data = (await response.json()) as { url: string };
  return { ok: true, url: data.url };
}

/**
 * Sends (or resends) the email for a pending staff invitation. The
 * invitation row itself is created directly via staffService.inviteStaff —
 * this only triggers delivery, since the Resend API key is a server secret
 * the browser can never hold.
 */
export async function sendStaffInvite(invitationId: string): Promise<ActionResult> {
  const response = await fetch(fnUrl('send-staff-invite'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify({ invitation_id: invitationId }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return { ok: false, error: body?.error?.message ?? 'Could not send the invitation email.' };
  }
  return { ok: true, error: null };
}

export interface ExtractedMenuItem {
  name: string;
  description: string | null;
  price: number;
}

export interface ExtractedMenuCategory {
  name: string;
  items: ExtractedMenuItem[];
}

export interface ExtractedMenu {
  restaurant_name: string | null;
  categories: ExtractedMenuCategory[];
}

export interface ImportMenuResult {
  ok: boolean;
  menu?: ExtractedMenu;
  error?: string;
}

/**
 * Extracts structured menu data from raw text via the AI provider configured
 * server-side (ai-menu-import). Returns the proposed menu for the owner to
 * review/edit before applying — this call does not write to the database.
 */
export async function importMenuFromText(
  restaurantId: string,
  sourceText: string,
): Promise<ImportMenuResult> {
  const response = await fetch(fnUrl('ai-menu-import'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: await authHeader(),
    },
    body: JSON.stringify({ restaurant_id: restaurantId, source_text: sourceText }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return { ok: false, error: body?.error?.message ?? 'Could not import the menu.' };
  }
  const data = (await response.json()) as { menu: ExtractedMenu };
  return { ok: true, menu: data.menu };
}
