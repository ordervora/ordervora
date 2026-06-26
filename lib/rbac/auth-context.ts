import 'server-only';

/**
 * Server-side authentication & authorization context.
 *
 * Resolves the signed-in user into a rich context: their profile, every
 * restaurant they staff (with role), and whether they are a platform admin.
 * Server Components, Route Handlers, and surface layouts call these helpers to
 * make access decisions. All reads go through the RLS-bound server client, so
 * the data returned is already scoped to what the user may see.
 */

import { cache } from 'react';
import type { User } from '@supabase/supabase-js';

import { getServerClient } from '@/lib/supabase/server';
import {
  roleHasPermission,
  type Permission,
  DASHBOARD_ROLES,
  KDS_ROLES,
} from '@/lib/rbac/permissions';
import type { StaffRole } from '@/config/constants';
import type { Tables } from '@/types/database.types';

export interface StaffMembership {
  restaurantId: string;
  role: StaffRole;
  status: string;
}

export interface AuthContext {
  user: User;
  profile: Tables<'profiles'> | null;
  isPlatformAdmin: boolean;
  /** Active staff memberships across all restaurants. */
  memberships: StaffMembership[];
}

/**
 * Resolves the full auth context for the current request, or null when no user
 * is signed in. Wrapped in React `cache` so multiple callers within one request
 * share a single resolution.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await getServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Profile and memberships are both RLS-scoped to this user.
  const [{ data: profile }, { data: staffRows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('restaurant_staff')
      .select('restaurant_id, role, status')
      .eq('user_id', user.id)
      .eq('status', 'active'),
  ]);

  const memberships: StaffMembership[] = (
    (staffRows ?? []) as Pick<
      Tables<'restaurant_staff'>,
      'restaurant_id' | 'role' | 'status'
    >[]
  ).map((row) => ({
    restaurantId: row.restaurant_id,
    role: row.role,
    status: row.status,
  }));

  return {
    user,
    profile: profile ?? null,
    isPlatformAdmin: profile?.is_platform_admin ?? false,
    memberships,
  };
});

/** The user's active role at a restaurant, or null if not staff there. */
export function roleAt(ctx: AuthContext, restaurantId: string): StaffRole | null {
  return ctx.memberships.find((m) => m.restaurantId === restaurantId)?.role ?? null;
}

/** True if the user holds `permission` at the given restaurant. */
export function can(
  ctx: AuthContext,
  restaurantId: string,
  permission: Permission,
): boolean {
  if (ctx.isPlatformAdmin) return true;
  const role = roleAt(ctx, restaurantId);
  return role ? roleHasPermission(role, permission) : false;
}

/** True if the user may open the owner dashboard for the restaurant. */
export function canAccessDashboard(ctx: AuthContext, restaurantId: string): boolean {
  if (ctx.isPlatformAdmin) return true;
  const role = roleAt(ctx, restaurantId);
  return role ? DASHBOARD_ROLES.includes(role) : false;
}

/** True if the user may open the KDS for the restaurant. */
export function canAccessKds(ctx: AuthContext, restaurantId: string): boolean {
  if (ctx.isPlatformAdmin) return true;
  const role = roleAt(ctx, restaurantId);
  return role ? KDS_ROLES.includes(role) : false;
}

/** True if the user staffs any restaurant in any role. */
export function isAnyStaff(ctx: AuthContext): boolean {
  return ctx.memberships.length > 0;
}
