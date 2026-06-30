import 'server-only';

/**
 * Session-refresh helper for `middleware.ts`.
 *
 * Supabase access tokens expire; this keeps them fresh on every request by
 * reading the request cookies, refreshing the session, and writing any updated
 * cookies onto the response. It also returns the resolved user so middleware
 * can make routing decisions without a second round-trip.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';

import { clientEnv } from '@/config/env';
import type { Database } from '@/types/database.types';

export interface MiddlewareSession {
  /** The response carrying refreshed auth cookies — return this from middleware. */
  response: NextResponse;
  /** The signed-in user, or null when unauthenticated. */
  user: User | null;
}

/**
 * Refreshes the Supabase session for the incoming request and returns both the
 * cookie-bearing response and the current user.
 */
export async function updateSession(request: NextRequest): Promise<MiddlewareSession> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    clientEnv.supabaseUrl,
    clientEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          // Write to the request (so downstream reads see fresh values) and to
          // a fresh response (so the browser receives the updated cookies).
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getSession() reads the JWT from the cookie without a network round-trip.
  // Middleware runs on every request; a live getUser() round-trip per request
  // adds latency that can cause 522 timeouts under load. Routing decisions here
  // only need to know whether a session exists — fine-grained trust verification
  // via getUser() happens in server components and layouts where it matters.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { response, user: session?.user ?? null };
}
