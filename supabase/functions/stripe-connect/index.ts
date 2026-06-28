/**
 * stripe-connect — restaurant Stripe Connect self-service onboarding.
 *
 * Owner-only (matches the `settings.manage` permission tier the dashboard
 * gates the Settings page behind). Creates a Stripe Express connected account
 * on first call and persists its id immediately so a retry never creates a
 * duplicate account, then always returns a fresh Account Link for the browser
 * to redirect to. Onboarding status (charges_enabled/details_submitted) is
 * reconciled separately by the `account.updated` case in stripe-webhook —
 * this function only starts or resumes the hosted Stripe flow.
 */

import {
  handlePreflight,
  jsonResponse,
  errorResponse,
} from '../_shared/http.ts';
import { userClient, serviceClient, getUserId } from '../_shared/supabase.ts';
import { isOwner, writeAudit } from '../_shared/auth.ts';
import { stripe } from '../_shared/stripe.ts';

interface ConnectRequest {
  restaurant_id?: string;
  return_url?: string;
  refresh_url?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handlePreflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('Not authenticated.', 401);

  let body: ConnectRequest;
  try {
    body = (await req.json()) as ConnectRequest;
  } catch {
    return errorResponse('Invalid JSON body.', 400);
  }

  const { restaurant_id: restaurantId, return_url: returnUrl, refresh_url: refreshUrl } = body;
  if (!restaurantId || !returnUrl || !refreshUrl) {
    return errorResponse(
      'restaurant_id, return_url, and refresh_url are required.',
      400,
    );
  }

  const user = userClient(req);
  if (!(await isOwner(user, restaurantId, userId))) {
    return errorResponse(
      'Only the restaurant owner can manage payments.',
      403,
      'forbidden',
    );
  }

  const service = serviceClient();
  const { data: restaurant, error: restaurantError } = await service
    .from('restaurants')
    .select('id, name, email, stripe_account_id')
    .eq('id', restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return errorResponse('Restaurant not found.', 404);
  }

  let accountId = restaurant.stripe_account_id;

  if (!accountId) {
    let account;
    try {
      account = await stripe.accounts.create({
        type: 'express',
        email: restaurant.email ?? undefined,
        business_profile: { name: restaurant.name },
        metadata: { restaurant_id: restaurantId },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not create the Stripe account.';
      return errorResponse(message, 502, 'stripe_error');
    }
    accountId = account.id;

    const { error: updateError } = await service
      .from('restaurants')
      .update({ stripe_account_id: accountId })
      .eq('id', restaurantId);

    if (updateError) {
      return errorResponse('Could not save the Stripe account.', 500);
    }

    await writeAudit(service, {
      restaurantId,
      actorId: userId,
      action: 'stripe.account_created',
      entityType: 'restaurant',
      entityId: restaurantId,
      metadata: { stripe_account_id: accountId },
    });
  }

  let accountLink;
  try {
    accountLink = await stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Could not start Stripe onboarding.';
    return errorResponse(message, 502, 'stripe_error');
  }

  return jsonResponse({ url: accountLink.url });
});
