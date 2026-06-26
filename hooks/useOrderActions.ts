'use client';

/**
 * useOrderActions — KDS write actions.
 *
 * Bumping and recalling orders go through the advance-order Edge Function so the
 * transition is validated and audited server-side. The "86" toggle goes through
 * the KDS service (a single-column products update kitchen-tier may perform).
 * None of these actions read or write money.
 */

import { useCallback, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';
import { clientEnv } from '@/config/env';
import { kdsService } from '@/lib/services';
import type { OrderState } from '@/config/constants';

interface ActionState {
  pendingOrderId: string | null;
  error: string | null;
}

async function callAdvance(
  orderId: string,
  toState: OrderState,
): Promise<{ ok: boolean; message: string | null }> {
  const client = getBrowserClient();
  const {
    data: { session },
  } = await client.auth.getSession();

  const response = await fetch(
    `${clientEnv.supabaseUrl}/functions/v1/advance-order`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? clientEnv.supabaseAnonKey}`,
      },
      body: JSON.stringify({ orderId, toState }),
    },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return {
      ok: false,
      message: body?.error?.message ?? 'Could not update the order.',
    };
  }
  return { ok: true, message: null };
}

export interface UseOrderActionsResult {
  pendingOrderId: string | null;
  error: string | null;
  /** Advance an order to the next state in the kitchen flow. */
  bump: (orderId: string, toState: OrderState) => Promise<boolean>;
  /** Move a ready/preparing order back one step. */
  recall: (orderId: string, toState: OrderState) => Promise<boolean>;
  /** Mark a product available/unavailable from the kitchen. */
  toggleEightySix: (productId: string, unavailable: boolean) => Promise<boolean>;
}

export function useOrderActions(): UseOrderActionsResult {
  const [state, setState] = useState<ActionState>({
    pendingOrderId: null,
    error: null,
  });

  const run = useCallback(
    async (orderId: string, toState: OrderState): Promise<boolean> => {
      setState({ pendingOrderId: orderId, error: null });
      const result = await callAdvance(orderId, toState);
      setState({
        pendingOrderId: null,
        error: result.ok ? null : result.message,
      });
      return result.ok;
    },
    [],
  );

  const bump = useCallback(
    (orderId: string, toState: OrderState) => run(orderId, toState),
    [run],
  );

  const recall = useCallback(
    (orderId: string, toState: OrderState) => run(orderId, toState),
    [run],
  );

  const toggleEightySix = useCallback(
    async (productId: string, unavailable: boolean): Promise<boolean> => {
      const client = getBrowserClient();
      const result = await kdsService.eightySixProduct(
        client,
        productId,
        unavailable,
      );
      if (result.error) {
        setState((prev) => ({ ...prev, error: result.error.message }));
        return false;
      }
      return true;
    },
    [],
  );

  return {
    pendingOrderId: state.pendingOrderId,
    error: state.error,
    bump,
    recall,
    toggleEightySix,
  };
}
