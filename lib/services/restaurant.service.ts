/**
 * Restaurant service.
 *
 * Resolves tenants and their configuration. The storefront resolves a
 * restaurant by slug; staff surfaces load by id. Settings are owner-tier under
 * RLS, so reading them with a non-owner client returns nothing — callers should
 * gate the call by role before relying on settings.
 */

import {
  type Client,
  type ServiceResult,
  ok,
  fail,
  toServiceError,
  isNotFound,
} from './_shared';
import type { Tables } from '@/types/database.types';

export type Restaurant = Tables<'restaurants'>;
export type RestaurantSettings = Tables<'restaurant_settings'>;

/** Resolves an active restaurant by its URL slug. */
export async function getRestaurantBySlug(
  client: Client,
  slug: string,
): Promise<ServiceResult<Restaurant>> {
  const { data, error } = await client
    .from('restaurants')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .single();

  if (error) {
    if (isNotFound(error)) return fail('Restaurant not found.', error.code);
    return fail(error.message, toServiceError(error).code);
  }
  return ok(data);
}

/** Loads a restaurant by id (staff surfaces). */
export async function getRestaurantById(
  client: Client,
  restaurantId: string,
): Promise<ServiceResult<Restaurant>> {
  const { data, error } = await client
    .from('restaurants')
    .select('*')
    .eq('id', restaurantId)
    .single();

  if (error) {
    if (isNotFound(error)) return fail('Restaurant not found.', error.code);
    return fail(error.message, toServiceError(error).code);
  }
  return ok(data);
}

/**
 * Loads the settings row for a restaurant. Returns null data when the caller
 * lacks owner-tier access (RLS hides the row) or when no settings exist yet.
 */
export async function getRestaurantSettings(
  client: Client,
  restaurantId: string,
): Promise<ServiceResult<RestaurantSettings | null>> {
  const { data, error } = await client
    .from('restaurant_settings')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Updates branding/profile fields on a restaurant (owner-tier under RLS). */
export async function updateRestaurant(
  client: Client,
  restaurantId: string,
  patch: Partial<
    Pick<
      Restaurant,
      | 'name'
      | 'logo_url'
      | 'brand_colors'
      | 'address'
      | 'city'
      | 'region'
      | 'postal_code'
      | 'phone'
      | 'email'
      | 'timezone'
      | 'hours'
      | 'tax_rate'
      | 'restaurant_type'
      | 'holiday_hours'
      | 'onboarding_step'
      | 'site_content'
    >
  >,
): Promise<ServiceResult<Restaurant>> {
  const { data, error } = await client
    .from('restaurants')
    .update(patch)
    .eq('id', restaurantId)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/**
 * Creates a new restaurant and seats the caller as its first owner, via the
 * `create_restaurant_with_owner` RPC (migration 0003). This is the only path
 * that can insert into `restaurants` for a non-platform-admin user — RLS
 * grants INSERT there to platform_admin only, and the SECURITY DEFINER
 * function is the audited gate around that.
 */
export async function createRestaurantWithOwner(
  client: Client,
  input: {
    slug: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    timezone?: string | null;
  },
): Promise<ServiceResult<{ id: string; slug: string }>> {
  const { data, error } = await client.rpc('create_restaurant_with_owner', {
    p_slug: input.slug,
    p_name: input.name,
    p_email: input.email ?? null,
    p_phone: input.phone ?? null,
    p_timezone: input.timezone ?? null,
  });

  if (error) return fail(error.message, toServiceError(error).code);
  const row = data?.[0];
  if (!row) return fail('Restaurant creation returned no data.');
  return ok({ id: row.id, slug: row.slug });
}

/**
 * Updates a restaurant's settings row (1:1). Upserts on restaurant_id so a
 * restaurant without a settings row yet still gets one. Used by the dashboard
 * Settings section for sound, notification, loyalty, and other config blocks.
 */
export async function updateRestaurantSettings(
  client: Client,
  restaurantId: string,
  patch: Partial<
    Pick<
      RestaurantSettings,
      | 'sound_config'
      | 'printer_config'
      | 'notification_config'
      | 'security_config'
      | 'loyalty_config'
      | 'fulfillment_config'
      | 'tip_config'
      | 'kitchen_config'
      | 'policies_config'
    >
  >,
): Promise<ServiceResult<RestaurantSettings>> {
  const { data, error } = await client
    .from('restaurant_settings')
    .upsert({ restaurant_id: restaurantId, ...patch }, { onConflict: 'restaurant_id' })
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}
