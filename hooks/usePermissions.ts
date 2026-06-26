'use client';

/**
 * Client-side permission gating.
 *
 * Given the viewer's role at the current restaurant (resolved on the server and
 * passed down as a prop or via context), returns a `has(permission)` checker
 * for hiding or disabling UI. This is UX only — the database RLS layer is the
 * actual security boundary, so never use this to protect data, only to avoid
 * showing controls a user can't successfully use.
 */

import { useMemo } from 'react';

import { roleHasPermission, type Permission } from '@/lib/rbac/permissions';
import type { StaffRole } from '@/config/constants';

export interface UsePermissionsResult {
  has: (permission: Permission) => boolean;
  role: StaffRole | null;
  isPlatformAdmin: boolean;
}

export function usePermissions(
  role: StaffRole | null,
  isPlatformAdmin = false,
): UsePermissionsResult {
  return useMemo(
    () => ({
      role,
      isPlatformAdmin,
      has: (permission: Permission) => {
        if (isPlatformAdmin) return true;
        return role ? roleHasPermission(role, permission) : false;
      },
    }),
    [role, isPlatformAdmin],
  );
}
