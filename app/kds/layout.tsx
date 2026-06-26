import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { getAuthContext, isAnyStaff } from '@/lib/rbac';
import { ROUTES } from '@/config/constants';

import './kds.css';

/**
 * KDS layout.
 *
 * Guards the surface: a signed-in user who staffs at least one restaurant. The
 * middleware already redirects anonymous users to sign-in; this adds the
 * staff-membership check. Per-restaurant KDS-role gating happens in the page,
 * which resolves the specific restaurant.
 */
export default async function KdsLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();

  if (!ctx) redirect(`${ROUTES.signIn}?redirect=${ROUTES.kds}`);
  if (!isAnyStaff(ctx)) redirect('/');

  return children;
}
