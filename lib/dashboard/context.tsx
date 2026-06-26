'use client';

/**
 * Dashboard context.
 *
 * Carries the active restaurant and the viewer's role to every dashboard client
 * component, so they can scope queries by restaurant_id and gate controls by
 * role without re-resolving auth. Populated by the dashboard layout from the
 * server-side RBAC context.
 */

import { createContext, useContext, type ReactNode } from 'react';

import type { Restaurant } from '@/lib/services/restaurant.service';
import type { StaffRole } from '@/config/constants';

export interface DashboardContextValue {
  restaurant: Restaurant;
  role: StaffRole;
  isPlatformAdmin: boolean;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  value,
  children,
}: {
  value: DashboardContextValue;
  children: ReactNode;
}) {
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error('useDashboard must be used within a DashboardProvider.');
  }
  return ctx;
}
