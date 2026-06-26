/**
 * Seed 02 — staff users + roster.
 *
 * Creates auth users via the admin API (which fires the profile auto-provision
 * trigger), then links each as restaurant_staff with a role. The five roles span
 * the RBAC tiers so every permission path is testable: owner, manager, cashier,
 * kitchen, delivery. Idempotent: an existing auth user for an email is reused.
 *
 * Demo credentials use a shared password so the demo tenant can be explored from
 * any role. These are demo accounts on demo data — not production secrets.
 */

import { type SeedClient, unwrap, logStep } from './_shared';
import type { Database } from '../../types/database.types';

type StaffRole = Database['public']['Tables']['restaurant_staff']['Row']['role'];

const DEMO_PASSWORD = 'DemoDeli!2024';

interface StaffSpec {
  email: string;
  fullName: string;
  role: StaffRole;
}

const STAFF: StaffSpec[] = [
  { email: 'owner@demodeli.example', fullName: 'Robin Vale', role: 'owner' },
  { email: 'manager@demodeli.example', fullName: 'Priya Anand', role: 'manager' },
  { email: 'cashier@demodeli.example', fullName: 'Marco Diaz', role: 'cashier' },
  { email: 'kitchen@demodeli.example', fullName: 'Sam Okoro', role: 'kitchen' },
  { email: 'delivery@demodeli.example', fullName: 'Lena Fischer', role: 'delivery' },
];

export interface SeededStaff {
  byRole: Record<StaffRole, string>; // role -> auth user id
}

/** Finds an existing auth user id by email, paging through the admin list. */
async function findAuthUserId(
  client: SeedClient,
  email: string,
): Promise<string | null> {
  // The admin listUsers API is paginated; demo data is small so a few pages
  // are more than enough to locate a seeded account.
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email === email);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Creates an auth user (or reuses one), returning its id. */
async function ensureAuthUser(
  client: SeedClient,
  spec: StaffSpec,
): Promise<string> {
  const created = await client.auth.admin.createUser({
    email: spec.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: spec.fullName },
  });

  if (!created.error && created.data.user) {
    return created.data.user.id;
  }

  // Already exists — locate it.
  const existingId = await findAuthUserId(client, spec.email);
  if (existingId) return existingId;

  throw new Error(
    `Could not create or find auth user ${spec.email}: ${created.error?.message ?? 'unknown error'}`,
  );
}

export async function seedStaff(
  client: SeedClient,
  restaurantId: string,
): Promise<SeededStaff> {
  logStep('Staff users + roster');

  const byRole = {} as Record<StaffRole, string>;

  for (const spec of STAFF) {
    const userId = await ensureAuthUser(client, spec);
    byRole[spec.role] = userId;

    // Ensure the profile carries the display name (trigger inserts a base row).
    unwrap(
      await client
        .from('profiles')
        .update({ full_name: spec.fullName })
        .eq('id', userId)
        .select('id')
        .single(),
    );

    // Link as staff. Upsert on the (restaurant_id, user_id) unique pair.
    unwrap(
      await client
        .from('restaurant_staff')
        .upsert(
          {
            restaurant_id: restaurantId,
            user_id: userId,
            role: spec.role,
            display_name: spec.fullName,
            status: 'active',
          },
          { onConflict: 'restaurant_id,user_id' },
        )
        .select('id')
        .single(),
    );

    logStep(`  → ${spec.role}: ${spec.fullName} <${spec.email}>`);
  }

  return { byRole };
}
