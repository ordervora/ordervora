import 'server-only';

/**
 * Service-role Supabase client.
 *
 * ⚠️  BYPASSES Row Level Security. This client can read and write every row in
 *     every tenant. It must NEVER be imported into client code or any module
 *     that reaches the browser bundle. The `server-only` import above turns an
 *     accidental client import into a build-time error, and `serverEnv` throws
 *     if the service key is read in the browser.
 *
 * Legitimate uses (all server-side):
 *   - Platform admin operations across tenants
 *   - Edge Function / webhook logic that runs as the system
 *   - Seed scripts
 *
 * For anything acting on behalf of a signed-in user, use `server.ts` so RLS
 * still applies.
 */

import { createClient } from '@supabase/supabase-js';

import { clientEnv, serverEnv } from '@/config/env';
import type { Database } from '@/types/database.types';

let serviceClient: ReturnType<typeof createClient<Database>> | undefined;

/**
 * Returns the singleton service-role client. No session is persisted or
 * refreshed because this client never acts as a user.
 */
export function getServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient<Database>(
      clientEnv.supabaseUrl,
      serverEnv.supabaseServiceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }
  return serviceClient;
}
