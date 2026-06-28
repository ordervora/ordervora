'use client';

/**
 * Sidebar — dashboard navigation.
 *
 * Lists the dashboard sections, highlights the active route, and shows a live
 * count of active orders as a badge (subscribed via the realtime orders hook).
 * Sections that require manager/owner tier are hidden for lower roles, mirroring
 * what RLS would allow.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ClipboardList,
  UtensilsCrossed,
  Users,
  Tag,
  Star,
  BarChart3,
  UserCog,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useDashboard } from '@/lib/dashboard/context';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { KDS_ACTIVE_STATES } from '@/config/constants';
import { roleHasPermission } from '@/lib/rbac/permissions';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: Parameters<typeof roleHasPermission>[1] | null;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'reports.view' },
  { href: '/dashboard/orders', label: 'Orders', icon: ClipboardList, permission: 'orders.view' },
  { href: '/dashboard/menu', label: 'Menu', icon: UtensilsCrossed, permission: 'menu.view' },
  { href: '/dashboard/customers', label: 'Customers', icon: Users, permission: 'customers.view' },
  { href: '/dashboard/coupons', label: 'Coupons', icon: Tag, permission: 'coupons.manage' },
  { href: '/dashboard/reviews', label: 'Reviews', icon: Star, permission: 'reviews.reply' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, permission: 'reports.view' },
  { href: '/dashboard/staff', label: 'Staff', icon: UserCog, permission: 'staff.manage' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, permission: 'settings.manage' },
];

export function Sidebar() {
  const { restaurant, role, isPlatformAdmin } = useDashboard();
  const pathname = usePathname();
  const { orders } = useRealtimeOrders(restaurant.id, {
    states: KDS_ACTIVE_STATES,
  });

  const activeCount = orders.length;

  const visible = NAV.filter(
    (item) =>
      isPlatformAdmin ||
      item.permission === null ||
      roleHasPermission(role, item.permission),
  );

  return (
    <aside className="dash-side">
      <div className="dash-brand">
        <div className="dash-brand-name">{restaurant.name}</div>
        <div className="dash-brand-sub">
          <span className="dash-pulse" />
          Live · {role}
        </div>
      </div>
      <nav className="dash-nav">
        {visible.map((item) => {
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          const showBadge = item.href === '/dashboard/orders' && activeCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="dash-navlink"
              data-active={active}
            >
              <item.icon size={16} strokeWidth={2} />
              <span>{item.label}</span>
              {showBadge && <span className="dash-navbadge">{activeCount}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="dash-side-foot">
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="dash-btn" style={{ width: '100%' }}>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
