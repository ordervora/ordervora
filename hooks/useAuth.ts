'use client';

/**
 * Client-side auth hook.
 *
 * Tracks the current Supabase user in the browser and stays in sync with auth
 * state changes (sign-in, sign-out, token refresh). For authorization decisions
 * prefer the server-side RBAC context; this hook is for client UI that needs to
 * know whether someone is signed in and who they are.
 */

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import { getBrowserClient } from '@/lib/supabase/client';

export interface UseAuthResult {
  user: User | null;
  loading: boolean;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getBrowserClient();
    let active = true;

    supabase.auth
      .getUser()
      .then(({ data }: { data: { user: User | null } }) => {
        if (!active) return;
        setUser(data.user ?? null);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: string, session: { user: User } | null) => {
        if (!active) return;
        setUser(session?.user ?? null);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
