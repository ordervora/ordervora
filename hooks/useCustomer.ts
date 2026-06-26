'use client';

/**
 * useCustomer — resolves the signed-in user's customer record at a restaurant.
 *
 * A customer record is per-restaurant. This hook finds the current user's
 * record for the active restaurant (or returns null for guests / not-yet-created
 * records). It does not auto-create the record; checkout creates one when a
 * signed-in user places their first order, so guests can browse freely.
 */

import { useEffect, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';
import { customerService } from '@/lib/services';
import { useAuth } from './useAuth';
import type { Customer } from '@/lib/services/customer.service';

export interface UseCustomerResult {
  customer: Customer | null;
  loading: boolean;
  refresh: () => void;
}

export function useCustomer(restaurantId: string): UseCustomerResult {
  const { user, loading: authLoading } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;

    if (authLoading) return;
    if (!user) {
      setCustomer(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const client = getBrowserClient();
    customerService
      .getCurrentCustomer(client, restaurantId, user.id)
      .then((result) => {
        if (!active) return;
        setCustomer(result.error ? null : result.data);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [restaurantId, user, authLoading, nonce]);

  return {
    customer,
    loading: loading || authLoading,
    refresh: () => setNonce((n) => n + 1),
  };
}
