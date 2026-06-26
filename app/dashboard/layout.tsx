import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import {
  getAuthContext,
  canAccessDashboard,
  roleAt,
} from '@/lib/rbac';
import { getServerClient } from '@/lib/supabase/server';
import { restaurantService } from '@/lib/services';
import { DashboardProvider } from '@/lib/dashboard/context';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { ROUTES } from '@/config/constants';

import './dashboard.css';

/**
 * Dashboard layout.
 *
 * Guards the surface (signed-in, dashboard-capable role), resolves the active
 * restaurant — `?restaurant=<id>` for multi-restaurant staff, else the first
 * dashboard-accessible membership — loads it, and provides the dashboard context
 * plus the sidebar to all sections. RLS still enforces every query underneath.
 */
export default async function DashboardLayout({
  children,
  searchParams,
}: {
  children: ReactNode;
  searchParams?: Promise<{ restaurant?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect(`${ROUTES.signIn}?redirect=${ROUTES.dashboard}`);

  const accessible = ctx.memberships.filter((m) =>
    canAccessDashboard(ctx, m.restaurantId),
  );
  if (accessible.length === 0 && !ctx.isPlatformAdmin) {
    redirect('/');
  }

  const requested = (await searchParams)?.restaurant;
  const selectedId =
    (requested &&
      accessible.find((m) => m.restaurantId === requested)?.restaurantId) ||
    accessible[0]?.restaurantId;

  if (!selectedId) redirect('/');

  const client = await getServerClient();
  const result = await restaurantService.getRestaurantById(client, selectedId);
  if (result.error || !result.data) redirect('/');

  const role = roleAt(ctx, selectedId) ?? 'owner';

  return (
    <div className="dash">
      <DashboardProvider
        value={{
          restaurant: result.data,
          role,
          isPlatformAdmin: ctx.isPlatformAdmin,
        }}
      >
        <Sidebar />
        <div className="dash-main">{children}</div>
      </DashboardProvider>
    </div>
  );
}
