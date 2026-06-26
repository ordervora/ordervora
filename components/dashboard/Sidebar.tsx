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

import { useDashboard } from '@/lib/dashboard/context';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { KDS_ACTIVE_STATES } from '@/config/constants';
import { roleHasPermission } from '@/lib/rbac/permissions';

interface NavItem {
  href: string;
  label: string;
  permission: Parameters<typeof roleHasPermission>[1] | null;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', permission: 'reports.view' },
  { href: '/dashboard/orders', label: 'Orders', permission: 'orders.view' },
  { href: '/dashboard/menu', label: 'Menu', permission: 'menu.view' },
  { href: '/dashboard/customers', label: 'Customers', permission: 'customers.view' },
  { href: '/dashboard/coupons', label: 'Coupons', permission: 'coupons.manage' },
  { href: '/dashboard/reviews', label: 'Reviews', permission: 'reviews.reply' },
  { href: '/dashboard/analytics', label: 'Analytics', permission: 'reports.view' },
  { href: '/dashboard/staff', label: 'Staff', permission: 'staff.manage' },
  { href: '/dashboard/settings', label: 'Settings', permission: 'settings.manage' },
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
