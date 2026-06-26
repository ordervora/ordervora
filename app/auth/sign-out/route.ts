/**
 * Sign-out route.
 *
 * POST to end the session and clear auth cookies, then redirect to sign-in.
 * Implemented as a POST (not GET) so a link prefetch or image loader can never
 * accidentally log the user out.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { getServerClient } from '@/lib/supabase/server';
import { ROUTES } from '@/config/constants';

export async function POST(request: NextRequest) {
  const supabase = await getServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL(ROUTES.signIn, request.url), {
    status: 303, // force the redirected request to be a GET
  });
}
