/**
 * ai-website-builder — drafts hero tagline + About section copy for a
 * restaurant's storefront, grounded in its real name, type, and a sample of
 * its actual menu items. Manager-tier, matching ai-menu-import's authorization
 * tier (content operations, not owner-only billing/Stripe operations).
 *
 * Like ai-menu-import, this only drafts and returns content — it does NOT
 * write to the database. The owner reviews/edits the draft in Settings, then
 * saves it via the existing restaurants.site_content column through the
 * RLS-bound client (restaurantService.updateRestaurant), so no second
 * "apply" function is needed.
 */

import {
  handlePreflight,
  jsonResponse,
  errorResponse,
} from '../_shared/http.ts';
import { userClient, serviceClient, getUserId } from '../_shared/supabase.ts';
import { isManager, writeAudit } from '../_shared/auth.ts';
import { getAIProvider, AiNotConfiguredError } from '../_shared/ai/index.ts';

const MAX_MENU_HIGHLIGHTS = 12;

interface BuildRequest {
  restaurant_id?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handlePreflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('Not authenticated.', 401);

  let body: BuildRequest;
  try {
    body = (await req.json()) as BuildRequest;
  } catch {
    return errorResponse('Invalid JSON body.', 400);
  }

  const restaurantId = body.restaurant_id;
  if (!restaurantId) {
    return errorResponse('restaurant_id is required.', 400);
  }

  const user = userClient(req);
  if (!(await isManager(user, restaurantId, userId))) {
    return errorResponse(
      'Only an owner or manager can generate website content.',
      403,
      'forbidden',
    );
  }

  const service = serviceClient();

  const { data: restaurant, error: restaurantError } = await service
    .from('restaurants')
    .select('name, restaurant_type')
    .eq('id', restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return errorResponse('Restaurant not found.', 404, 'not_found');
  }

  const { data: products } = await service
    .from('products')
    .select('name')
    .eq('restaurant_id', restaurantId)
    .eq('is_available', true)
    .order('sort_order', { ascending: true })
    .limit(MAX_MENU_HIGHLIGHTS);

  let content;
  try {
    const provider = getAIProvider();
    content = await provider.generateWebsiteContent({
      restaurantName: restaurant.name,
      restaurantType: restaurant.restaurant_type,
      menuHighlights: (products ?? []).map((p) => p.name),
    });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return errorResponse(error.message, 503, 'ai_not_configured');
    }
    const message =
      error instanceof Error
        ? error.message
        : 'Could not generate website content.';
    return errorResponse(message, 502, 'ai_error');
  }

  await writeAudit(service, {
    restaurantId,
    actorId: userId,
    action: 'website.ai_generated',
    entityType: 'restaurant',
    entityId: restaurantId,
    metadata: {},
  });

  return jsonResponse({ ok: true, content });
});
