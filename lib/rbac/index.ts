/** Public surface of the RBAC module. */

export {
  PERMISSIONS,
  DASHBOARD_ROLES,
  KDS_ROLES,
  roleHasPermission,
  permissionsForRole,
  type Permission,
} from './permissions';

export {
  getAuthContext,
  roleAt,
  can,
  canAccessDashboard,
  canAccessKds,
  isAnyStaff,
  type AuthContext,
  type StaffMembership,
} from './auth-context';
