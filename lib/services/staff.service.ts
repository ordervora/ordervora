/**
 * Staff service.
 *
 * The staff roster and role management for a restaurant. Reading the roster is
 * available to any staffer of that restaurant; adding, changing roles, and
 * removing staff are owner-tier under RLS. Each staffer is one row in
 * `restaurant_staff` joining a profile to the restaurant with a role.
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
import type { StaffRole } from '@/config/constants';

export type StaffMember = Tables<'restaurant_staff'>;
export type Profile = Tables<'profiles'>;

/** A staff row joined with the member's profile (name, avatar). */
export interface StaffWithProfile extends StaffMember {
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'phone'> | null;
}

/** Lists the staff roster for a restaurant with member profiles. */
export async function listStaff(
  client: Client,
  restaurantId: string,
): Promise<ServiceResult<StaffWithProfile[]>> {
  const { data, error } = await client
    .from('restaurant_staff')
    .select(
      `*,
       profile:profiles!restaurant_staff_user_id_fkey (
         id, full_name, avatar_url, phone
       )`,
    )
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: true });

  if (error) return fail(error.message, toServiceError(error).code);

  const rows = (data ?? []) as (StaffMember & {
    profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'phone'> | null;
  })[];
  return ok(rows);
}

/**
 * Adds a staff member by their profile id (owner-tier). The profile must
 * already exist — created when that person signs up. Returns a friendly error
 * if the person is already on the roster (unique restaurant+user constraint).
 */
export async function addStaff(
  client: Client,
  restaurantId: string,
  userId: string,
  role: StaffRole,
  displayName: string | null = null,
): Promise<ServiceResult<StaffMember>> {
  const { data, error } = await client
    .from('restaurant_staff')
    .insert({
      restaurant_id: restaurantId,
      user_id: userId,
      role,
      display_name: displayName,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return fail('This person is already on the staff roster.', error.code);
    }
    return fail(error.message, toServiceError(error).code);
  }
  return ok(data);
}

/** Changes a staff member's role (owner-tier). */
export async function updateStaffRole(
  client: Client,
  staffId: string,
  role: StaffRole,
): Promise<ServiceResult<StaffMember>> {
  const { data, error } = await client
    .from('restaurant_staff')
    .update({ role })
    .eq('id', staffId)
    .select('*')
    .single();

  if (error) {
    if (isNotFound(error)) return fail('Staff member not found.', error.code);
    return fail(error.message, toServiceError(error).code);
  }
  return ok(data);
}

/** Sets a staff member's status (active / off_shift / suspended). */
export async function setStaffStatus(
  client: Client,
  staffId: string,
  status: 'active' | 'off_shift' | 'suspended',
): Promise<ServiceResult<StaffMember>> {
  const { data, error } = await client
    .from('restaurant_staff')
    .update({ status })
    .eq('id', staffId)
    .select('*')
    .single();

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(data);
}

/** Removes a staff member from the roster (owner-tier). */
export async function removeStaff(
  client: Client,
  staffId: string,
): Promise<ServiceResult<true>> {
  const { error } = await client
    .from('restaurant_staff')
    .delete()
    .eq('id', staffId);

  if (error) return fail(error.message, toServiceError(error).code);
  return ok(true);
}
