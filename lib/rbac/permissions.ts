/**
 * Role-based access control — permission definitions.
 *
 * Mirrors the role matrix enforced by RLS in the database. RLS is the real
 * security boundary; this layer exists so the UI and server routing can decide
 * what to show and which routes to allow WITHOUT a database round-trip. Never
 * rely on these checks for data security — only for UX gating.
 *
 * Tiers, lowest to highest:
 *   kitchen / delivery / cashier  → operational floor (no money)
 *   manager                       → operations + revenue + customers + coupons
 *   owner                         → everything in a restaurant incl. staff/settings
 *   platform_admin                → all tenants (handled separately, global flag)
 */

import type { StaffRole } from '@/config/constants';

/**
 * Discrete capabilities the app gates on. Keep these aligned with what RLS
 * actually permits per role in `0001_initial_schema.sql`.
 */
export const PERMISSIONS = [
  'orders.view',
  'orders.advance', // move a ticket through states
  'orders.refund',
  'menu.view',
  'menu.edit', // full product/category CRUD
  'menu.toggle_availability', // "86" an item
  'customers.view',
  'customers.manage',
  'revenue.view', // any money: totals, reports, payments
  'payments.manage',
  'coupons.manage',
  'loyalty.manage',
  'reviews.reply',
  'reports.view',
  'staff.manage',
  'settings.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Capability grants per staff role. Absence of a permission means denied.
 * `revenue.view` / `payments.manage` are deliberately withheld from every
 * kitchen-tier role — the application mirror of the database revenue firewall.
 */
const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  owner: [
    'orders.view',
    'orders.advance',
    'orders.refund',
    'menu.view',
    'menu.edit',
    'menu.toggle_availability',
    'customers.view',
    'customers.manage',
    'revenue.view',
    'payments.manage',
    'coupons.manage',
    'loyalty.manage',
    'reviews.reply',
    'reports.view',
    'staff.manage',
    'settings.manage',
  ],
  manager: [
    'orders.view',
    'orders.advance',
    'orders.refund',
    'menu.view',
    'menu.edit',
    'menu.toggle_availability',
    'customers.view',
    'customers.manage',
    'revenue.view',
    'payments.manage',
    'coupons.manage',
    'loyalty.manage',
    'reviews.reply',
    'reports.view',
  ],
  cashier: [
    'orders.view',
    'orders.advance',
    'menu.view',
    'customers.view',
    'customers.manage',
  ],
  kitchen: [
    'orders.view',
    'orders.advance',
    'menu.view',
    'menu.toggle_availability',
  ],
  delivery: ['orders.view', 'orders.advance', 'menu.view'],
} as const;

/** Roles allowed to open the owner dashboard at all. */
export const DASHBOARD_ROLES: readonly StaffRole[] = [
  'owner',
  'manager',
  'cashier',
] as const;

/** Roles allowed to open the KDS. */
export const KDS_ROLES: readonly StaffRole[] = [
  'owner',
  'manager',
  'kitchen',
  'cashier',
  'delivery',
] as const;

/** True if the given role holds the permission. */
export function roleHasPermission(role: StaffRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** All permissions for a role (immutable copy). */
export function permissionsForRole(role: StaffRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
