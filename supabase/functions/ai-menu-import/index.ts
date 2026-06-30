/**
 * ai-menu-import — extracts structured menu data (categories/items/prices)
 * from raw menu text the owner pastes in (copied from a website, PDF, or
 * doc). Manager-tier, matching the categories/products RLS write policy.
 *
 * This function only extracts and returns the proposed menu — it does NOT
 * write to the database. The owner reviews/edits the result in the
 * dashboard, then applies it via the existing RLS-bound client (the same
 * path createProduct already uses), so no second "apply" function is
 * needed and the ANTHROPIC_API_KEY never leaves the Edge runtime.
 */

import {
  handlePreflight,
  jsonResponse,
  errorResponse,
} from '../_shared/http.ts';
import { userClient, serviceClient, getUserId } from '../_shared/supabase.ts';
import { isManager, writeAudit } from '../_shared/auth.ts';
import { getAIProvider, AiNotConfiguredError } from '../_shared/ai/index.ts';

const MAX_SOURCE_LENGTH = 20_000;

interface ImportRequest {
  restaurant_id?: string;
  source_text?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return handlePreflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed.', 405);

  const userId = await getUserId(req);
  if (!userId) return errorResponse('Not authenticated.', 401);

  let body: ImportRequest;
  try {
    body = (await req.json()) as ImportRequest;
  } catch {
    return errorResponse('Invalid JSON body.', 400);
  }

  const restaurantId = body.restaurant_id;
  const sourceText = body.source_text?.trim();

  if (!restaurantId) {
    return errorResponse('restaurant_id is required.', 400);
  }
  if (!sourceText) {
    return errorResponse('source_text is required.', 400);
  }
  if (sourceText.length > MAX_SOURCE_LENGTH) {
    return errorResponse(
      `source_text must be ${MAX_SOURCE_LENGTH} characters or fewer.`,
      400,
    );
  }

  const user = userClient(req);
  if (!(await isManager(user, restaurantId, userId))) {
    return errorResponse(
      'Only an owner or manager can import a menu.',
      403,
      'forbidden',
    );
  }

  let extracted;
  try {
    const provider = getAIProvider();
    extracted = await provider.extractMenu({ sourceText });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return errorResponse(error.message, 503, 'ai_not_configured');
    }
    const message =
      error instanceof Error
        ? error.message
        : 'Could not extract a menu from this text.';
    return errorResponse(message, 502, 'ai_error');
  }

  const service = serviceClient();
  await writeAudit(service, {
    restaurantId,
    actorId: userId,
    action: 'menu.ai_imported',
    entityType: 'restaurant',
    entityId: restaurantId,
    metadata: {
      categories: extracted.categories.length,
      items: extracted.categories.reduce((n, c) => n + c.items.length, 0),
    },
  });

  return jsonResponse({ ok: true, menu: extracted });
});
