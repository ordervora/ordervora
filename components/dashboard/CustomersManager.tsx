'use client';

/**
 * CustomersManager — customer relationship view.
 *
 * Lists customers with loyalty points, lifetime value, order count, and VIP
 * status (manager-tier figures). Selecting one shows their profile, saved
 * addresses, recent order history, and a notes field. All scoped by
 * restaurant_id under RLS.
 */

import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';

import { getBrowserClient } from '@/lib/supabase/client';
import { useDashboard } from '@/lib/dashboard/context';
import {
  customerService,
  orderService,
  loyaltyService,
} from '@/lib/services';
import { money, count, dateOnly } from '@/lib/dashboard/utils';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { SkeletonTable } from '@/components/dashboard/Skeleton';
import type { Customer, CustomerAddress } from '@/lib/services/customer.service';
import type { Order } from '@/lib/services/order.service';

interface Detail {
  customer: Customer;
  addresses: CustomerAddress[];
  orders: Order[];
  balance: number;
}

export function CustomersManager() {
  const { restaurant } = useDashboard();
  const currency = restaurant.currency;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [vipOnly, setVipOnly] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    let active = true;
    const client = getBrowserClient();
    customerService.listCustomers(client, restaurant.id).then((result) => {
      if (!active) return;
      setCustomers(result.error ? [] : result.data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [restaurant.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (vipOnly && !c.is_vip) return false;
      if (!q) return true;
      return (
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q)
      );
    });
  }, [customers, query, vipOnly]);

  async function openCustomer(customer: Customer) {
    const client = getBrowserClient();
    const [addresses, orders, balance] = await Promise.all([
      customerService.listAddresses(client, customer.id),
      orderService.listOrders(client, restaurant.id, { limit: 100 }),
      loyaltyService.getBalance(client, customer.id),
    ]);
    setDetail({
      customer,
      addresses: addresses.error ? [] : addresses.data,
      orders: orders.error
        ? []
        : orders.data.filter((o) => o.customer_id === customer.id).slice(0, 10),
      balance: balance.error ? customer.points : balance.data,
    });
  }

  return (
    <>
      <header className="dash-head">
        <div>
          <h1>Customers</h1>
          <div className="dash-head-sub">{filtered.length} shown</div>
        </div>
      </header>

      <div className="dash-body">
        <div className="dash-toolbar">
          <div className="dash-search">
            <input
              className="dash-input"
              placeholder="Search name, email, or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="dash-filters">
            <button
              className="dash-filter"
              data-active={vipOnly}
              onClick={() => setVipOnly((v) => !v)}
            >
              VIP only
            </button>
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-body" data-flush="true">
            {loading ? (
              <SkeletonTable rows={6} columns={6} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No customers found"
                description={
                  query || vipOnly
                    ? 'Try a different search or clear the VIP filter.'
                    : 'Customers will appear here once they place their first order.'
                }
              />
            ) : (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Contact</th>
                    <th className="dash-num">Points</th>
                    <th className="dash-num">Lifetime</th>
                    <th className="dash-num">Orders</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td className="dash-strong">
                        {c.name ?? 'Guest'}
                        {c.is_vip && (
                          <span
                            className="dash-badge"
                            data-tone="vip"
                            style={{ marginLeft: 8 }}
                          >
                            VIP
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--muted)' }}>
                        {c.email ?? c.phone ?? '—'}
                      </td>
                      <td className="dash-num">{count(c.points)}</td>
                      <td className="dash-num dash-money">
                        {money(Number(c.lifetime_value), currency)}
                      </td>
                      <td className="dash-num">{count(c.order_count)}</td>
                      <td className="dash-num">
                        <button
                          className="dash-btn"
                          data-size="sm"
                          onClick={() => void openCustomer(c)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {detail && (
        <div
          className="dash-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <div className="dash-modal">
            <div className="dash-modal-head">
              <span className="dash-modal-title">
                {detail.customer.name ?? 'Guest'}
              </span>
              <button className="dash-x" onClick={() => setDetail(null)}>
                ×
              </button>
            </div>
            <div className="dash-modal-body">
              <div className="dash-kv">
                <span className="dash-kv-label">Loyalty points</span>
                <span className="dash-kv-value">{count(detail.balance)}</span>
              </div>
              <div className="dash-kv">
                <span className="dash-kv-label">Tier</span>
                <span className="dash-kv-value">{detail.customer.tier}</span>
              </div>
              <div className="dash-kv">
                <span className="dash-kv-label">Lifetime value</span>
                <span className="dash-kv-value">
                  {money(Number(detail.customer.lifetime_value), currency)}
                </span>
              </div>
              <div className="dash-kv">
                <span className="dash-kv-label">Email</span>
                <span className="dash-kv-value">
                  {detail.customer.email ?? '—'}
                </span>
              </div>
              <div className="dash-kv">
                <span className="dash-kv-label">Phone</span>
                <span className="dash-kv-value">
                  {detail.customer.phone ?? '—'}
                </span>
              </div>

              {detail.addresses.length > 0 && (
                <>
                  <div className="dash-divider" />
                  <div
                    className="dash-kv-label"
                    style={{ marginBottom: 8, fontWeight: 700 }}
                  >
                    Saved addresses
                  </div>
                  {detail.addresses.map((a) => (
                    <div key={a.id} style={{ fontSize: 13, marginBottom: 4 }}>
                      {a.line1}
                      {a.city ? `, ${a.city}` : ''}
                    </div>
                  ))}
                </>
              )}

              <div className="dash-divider" />
              <div
                className="dash-kv-label"
                style={{ marginBottom: 8, fontWeight: 700 }}
              >
                Recent orders
              </div>
              {detail.orders.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  No orders yet.
                </div>
              ) : (
                <table className="dash-table">
                  <tbody>
                    {detail.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="dash-strong">#{o.order_number ?? '—'}</td>
                        <td style={{ textTransform: 'capitalize' }}>
                          {o.state.replace(/_/g, ' ')}
                        </td>
                        <td className="dash-num">{dateOnly(o.placed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
