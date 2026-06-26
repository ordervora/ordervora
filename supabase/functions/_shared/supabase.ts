/**
 * Supabase clients for the Edge runtime.
 *
 * Two clients, two trust levels:
 *   - `userClient(req)` forwards the caller's Authorization header, so queries
 *     run AS the signed-in user and stay bound by Row Level Security. Use it to
 *     authorize the caller (e.g. confirm they staff a restaurant).
 *   - `serviceClient()` uses the service-role key and BYPASSES RLS. Use it for
 *     the trusted writes a function must perform atomically across tables the
 *     caller may not directly touch (financials, payments, audit).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing Supabase environment: SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.',
  );
}

export type Client = SupabaseClient<Database>;

/** RLS-bound client acting as the request's authenticated user. */
export function userClient(req: Request): Client {
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client that bypasses RLS for trusted server-side writes. */
export function serviceClient(): Client {
  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolves the authenticated user id from the request, or null. */
export async function getUserId(req: Request): Promise<string | null> {
  const client = userClient(req);
  const {
    data: { user },
  } = await client.auth.getUser();
  return user?.id ?? null;
}
