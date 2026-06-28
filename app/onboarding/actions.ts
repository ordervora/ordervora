'use server';

/**
 * Restaurant onboarding server action.
 *
 * Lets a signed-in user with no restaurant of their own create one and become
 * its owner, via the `create_restaurant_with_owner` RPC. The caller must
 * already be authenticated — `restaurants` grants INSERT to platform_admin
 * only under RLS, so this is the one path a regular user has to stand up a
 * tenant, and it's gated by the RPC itself (auth.uid() must be set).
 */

import { getAuthContext } from '@/lib/rbac';
import { getServerClient } from '@/lib/supabase/server';
import { restaurantService } from '@/lib/services';

export interface OnboardingResult {
  ok: boolean;
  message: string;
  restaurantId?: string;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Creates a restaurant for the signed-in caller and seats them as owner. */
export async function createRestaurant(input: {
  name: string;
  slug: string;
  email?: string;
  phone?: string;
}): Promise<OnboardingResult> {
  const ctx = await getAuthContext();
  if (!ctx) {
    return { ok: false, message: 'You must be signed in to create a restaurant.' };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, message: 'Restaurant name is required.' };
  }

  const slug = slugify(input.slug || input.name);
  if (slug.length < 3) {
    return { ok: false, message: 'URL slug must be at least 3 characters (letters, numbers, hyphens).' };
  }

  const client = await getServerClient();
  const result = await restaurantService.createRestaurantWithOwner(client, {
    slug,
    name,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  });

  if (result.error) {
    return { ok: false, message: result.error.message };
  }

  return { ok: true, message: 'Restaurant created.', restaurantId: result.data.id };
}
