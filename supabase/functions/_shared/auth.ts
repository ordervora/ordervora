/**
 * Authorization and audit helpers shared across Edge Functions.
 *
 * Authorization uses the USER-scoped client so the caller's own membership and
 * role are read under RLS — a caller cannot claim a role they don't hold.
 * Audit writes use the SERVICE client because audit_logs is append-only and the
 * function records the event on the system's authority.
 */

import type { Client } from './supabase.ts';
import type { Tables } from './types.ts';

export type StaffRole = Tables<'restaurant_staff'>['role'];

const MANAGER_ROLES: readonly StaffRole[] = ['owner', 'manager'];
const STAFF_ROLES: readonly StaffRole[] = [
  'owner',
  'manager',
  'kitchen',
  'cashier',
  'delivery',
];

/** Resolves the caller's active role at a restaurant via their own RLS view. */
export async function getCallerRole(
  user: Client,
  restaurantId: string,
  userId: string,
): Promise<StaffRole | null> {
  const { data } = await user
    .from('restaurant_staff')
    .select('role')
    .eq('restaurant_id', restaurantId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  return data?.role ?? null;
}

/** True if the caller is owner/manager at the restaurant. */
export async function isManager(
  user: Client,
  restaurantId: string,
  userId: string,
): Promise<boolean> {
  const role = await getCallerRole(user, restaurantId, userId);
  return role !== null && MANAGER_ROLES.includes(role);
}

/** True if the caller is any active staff member at the restaurant. */
export async function isStaff(
  user: Client,
  restaurantId: string,
  userId: string,
): Promise<boolean> {
  const role = await getCallerRole(user, restaurantId, userId);
  return role !== null && STAFF_ROLES.includes(role);
}

/** Appends an audit-log entry (append-only) using the service client. */
export async function writeAudit(
  service: Client,
  entry: {
    restaurantId: string;
    actorId: string | null;
    action: string;
    entityType: string | null;
    entityId: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await service.from('audit_logs').insert({
    restaurant_id: entry.restaurantId,
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    metadata: (entry.metadata ?? {}) as Tables<'audit_logs'>['metadata'],
  });
}

/** Records a notification row (drives the KDS sound/alert engine). */
export async function writeNotification(
  service: Client,
  entry: {
    restaurantId: string;
    orderId: string | null;
    title: string;
    body: string;
    channel?: Tables<'notifications'>['channel'];
  },
): Promise<void> {
  await service.from('notifications').insert({
    restaurant_id: entry.restaurantId,
    order_id: entry.orderId,
    channel: entry.channel ?? 'in_app',
    status: 'sent',
    title: entry.title,
    body: entry.body,
  });
}
