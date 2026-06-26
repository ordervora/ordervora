import 'server-only';

/**
 * Server Supabase client.
 *
 * For Server Components, Route Handlers, and Server Actions. Reads and writes
 * the session via Next.js cookies, so it runs AS the signed-in user and stays
 * bound by Row Level Security. Use this for all server-side data access that
 * should respect the caller's permissions.
 *
 * For privileged operations that must bypass RLS, use `service.ts` instead.
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import { clientEnv } from '@/config/env';
import type { Database } from '@/types/database.types';

/**
 * Creates a request-scoped server client bound to the current cookie store.
 * Must be awaited because `cookies()` is async in Next.js 15.
 */
export async function getServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.supabaseUrl,
    clientEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          // In Server Components the cookie store is read-only; writes are a
          // no-op there and are instead applied by the middleware. In Route
          // Handlers and Server Actions the writes succeed. The try/catch keeps
          // both contexts working from one client factory.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — safe to ignore; the
            // session refresh is handled in middleware.
          }
        },
      },
    },
  );
}
