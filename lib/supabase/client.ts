'use client';

/**
 * Browser Supabase client.
 *
 * Used by Client Components and hooks. Authenticated with the public anon key,
 * so every query is bound by Row Level Security to the signed-in user. Safe to
 * include in the client bundle. A single instance is memoized per browser tab.
 */

import { createBrowserClient } from '@supabase/ssr';

import { clientEnv } from '@/config/env';
import type { Database } from '@/types/database.types';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Returns the singleton browser client. Reusing one instance keeps a single
 * auth/realtime connection per tab instead of opening one per component.
 */
export function getBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      clientEnv.supabaseUrl,
      clientEnv.supabaseAnonKey,
    );
  }
  return browserClient;
}
