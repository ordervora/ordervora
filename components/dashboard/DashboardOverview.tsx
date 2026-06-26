'use client';

/**
 * DashboardOverview — the home screen.
 *
 * Pulls today's revenue/tax/tip/AOV from the reports + financials services,
 * lists live orders via realtime, computes best sellers from recent orders, and
 * renders a 7-day sales chart plus a recent-activity feed from order events.
 * This surface is manager-tier: it intentionally shows revenue, taxes, and tips
 * — the opposite of the KDS firewall.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { getBrowserClient } from '@/lib/supabase/client';
import { useDashboard } from '@/lib/dashboard/context';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { reportsService, orderService } from '@/lib/services';
import {
  money,
  count,
  clock,
  todayWindow,
  lastDaysWindow,
} from '@/lib/dashboard/utils';
import { KDS_ACTIVE_STATES } from '@/config/constants';
import type { OrderState } from '@/config/constants';

interface TodayStats {
  revenue: number;
  tax: number;
  tip: number;
  net: number;
  orders: number;
  aov: number;
}

interface BestSeller {
  name: string;
  qty: number;
}

interface DayPoint {
  date: string;
  revenue: number;
}

const STATE_TONE: Record<OrderState, string> = {
  pending: 'active',
  accepted: 'active',
  preparing: 'prep',
  ready: 'ready',
  out_for_delivery: 'prep',
  completed: 'done',
  cancelled: 'dead',
  refunded: 'dead',
};

export function DashboardOverview() {
  const { restaurant } = useDashboard();
  const currency = restaurant.currency;

  const { orders: liveOrders } = useRealtimeOrders(restaurant.id, {
    states: KDS_ACTIVE_STATES,
  });

  const [today, setToday] = useState<TodayStats | null>(null);
  const [bestSellers, setBestSellers] = useState<BestSeller[]>([]);
  const [series, setSeries] = useState<DayPoint[]>([]);
  const [activity, setActivity] = useState<
    { id: string; text: string; at: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const client = getBrowserClient();
    const tWindow = todayWindow();
    const weekWindow = lastDaysWindow(7);

    async function load() {
      // Today's revenue summary (reports service) + financial breakdown.
      const [summary, daily, recent] = await Promise.all([
        reportsService.getRevenueSummary(client, restaurant.id, tWindow),
        reportsService.getDailyRevenue(client, restaurant.id, weekWindow),
        orderService.listOrders(client, restaurant.id, { limit: 60 }),
      ]);

      if (!active) return;

      // Tax + tip for today require the financial rows of today's completed orders.
      const completedToday = recent.error
        ? []
        : recent.data.filter(
            (o) =>
              o.state === 'completed' &&
              new Date(o.placed_at) >= new Date(tWindow.from) &&
              new Date(o.placed_at) < new Date(tWindow.to),
          );

      let tax = 0;
      let tip = 0;
      if (completedToday.length > 0) {
        const ids = completedToday.map((o) => o.id);
        const { data: fins } = await client
          .from('order_financials')
          .select('tax, tip')
          .in('order_id', ids);
        for (const row of (fins ?? []) as { tax: number; tip: number }[]) {
          tax += Number(row.tax);
          tip += Number(row.tip);
        }
      }

      if (!active) return;

      const revenue = summary.error ? 0 : summary.data.revenue;
      const orderCount = summary.error ? 0 : summary.data.orderCount;
      const aov = summary.error ? 0 : summary.data.averageOrderValue;
      const net = Math.round((revenue - tax) * 100) / 100;

      setToday({ revenue, tax, tip, net, orders: orderCount, aov });
      setSeries(daily.error ? [] : daily.data.map((d) => ({ date: d.date, revenue: d.revenue })));

      // Best sellers from recent order items (operational, no money needed).
      const recentIds = recent.error ? [] : recent.data.map((o) => o.id);
      if (recentIds.length > 0) {
        const { data: items } = await client
          .from('order_items')
          .select('name_snapshot, quantity, order_id')
          .in('order_id', recentIds);
        const tally = new Map<string, number>();
        for (const row of (items ?? []) as {
          name_snapshot: string;
          quantity: number;
        }[]) {
          tally.set(
            row.name_snapshot,
            (tally.get(row.name_snapshot) ?? 0) + row.quantity,
          );
        }
        const sorted = [...tally.entries()]
          .map(([name, qty]) => ({ name, qty }))
          .sort((a, b) => b.qty - a.qty)
          .slice(0, 5);
        if (active) setBestSellers(sorted);
      }

      // Recent activity from order events.
      const { data: events } = await client
        .from('order_events')
        .select('id, to_state, created_at, order_id')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false })
        .limit(8);
      if (active) {
        setActivity(
          ((events ?? []) as {
            id: string;
            to_state: string;
            created_at: string;
          }[]).map((e) => ({
            id: e.id,
            text: `Order moved to ${e.to_state.replace(/_/g, ' ')}`,
            at: e.created_at,
          })),
        );
      }

      if (active) setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [restaurant.id]);

  const maxRevenue = useMemo(
    () => Math.max(1, ...series.map((d) => d.revenue)),
    [series],
  );
  const maxSeller = useMemo(
    () => Math.max(1, ...bestSellers.map((b) => b.qty)),
    [bestSellers],
  );

  return (
    <>
      <header className="dash-head">
        <div>
          <h1>Dashboard</h1>
          <div className="dash-head-sub">Today at a glance</div>
        </div>
        <Link href="/dashboard/orders" className="dash-btn" data-variant="primary">
          View orders
        </Link>
      </header>

      <div className="dash-body">
        <div className="dash-kpis">
          <div className="dash-kpi" data-tone="green">
            <div className="dash-kpi-label">Revenue today</div>
            <div className="dash-kpi-value">
              {today ? money(today.revenue, currency) : '—'}
            </div>
            <div className="dash-kpi-sub">
              {today ? <b>{count(today.orders)}</b> : '—'} completed orders
            </div>
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-label">Net sales</div>
            <div className="dash-kpi-value">
              {today ? money(today.net, currency) : '—'}
            </div>
            <div className="dash-kpi-sub">Revenue less tax</div>
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-label">Tax collected</div>
            <div className="dash-kpi-value">
              {today ? money(today.tax, currency) : '—'}
            </div>
            <div className="dash-kpi-sub">Today</div>
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-label">Tips</div>
            <div className="dash-kpi-value">
              {today ? money(today.tip, currency) : '—'}
            </div>
            <div className="dash-kpi-sub">Today</div>
          </div>
          <div className="dash-kpi" data-tone="brass">
            <div className="dash-kpi-label">Avg order value</div>
            <div className="dash-kpi-value">
              {today ? money(today.aov, currency) : '—'}
            </div>
            <div className="dash-kpi-sub">Today</div>
          </div>
        </div>

        <div className="dash-grid" data-cols="2" style={{ marginBottom: 16 }}>
          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Sales · last 7 days</span>
            </div>
            <div className="dash-panel-body">
              {series.length === 0 ? (
                <div className="dash-empty">No sales in this period yet.</div>
              ) : (
                <div className="dash-chart">
                  {series.map((d) => (
                    <div className="dash-chart-col" key={d.date}>
                      <div
                        className="dash-chart-bar"
                        style={{ height: `${(d.revenue / maxRevenue) * 100}%` }}
                        title={money(d.revenue, currency)}
                      />
                      <span className="dash-chart-label">
                        {new Date(d.date).toLocaleDateString(undefined, {
                          weekday: 'short',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Best sellers</span>
            </div>
            <div className="dash-panel-body">
              {bestSellers.length === 0 ? (
                <div className="dash-empty">Not enough data yet.</div>
              ) : (
                <div className="dash-bars">
                  {bestSellers.map((b) => (
                    <div key={b.name}>
                      <div className="dash-bar-row">
                        <span className="dash-bar-label">{b.name}</span>
                        <span className="dash-bar-value">{b.qty} sold</span>
                      </div>
                      <div className="dash-bar-track">
                        <div
                          className="dash-bar-fill"
                          style={{ width: `${(b.qty / maxSeller) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="dash-grid" data-cols="2">
          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Live orders</span>
              <Link href="/dashboard/orders" className="dash-link">
                Manage
              </Link>
            </div>
            <div className="dash-panel-body" data-flush="true">
              {liveOrders.length === 0 ? (
                <div className="dash-empty">No active orders right now.</div>
              ) : (
                <table className="dash-table">
                  <tbody>
                    {liveOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="dash-strong">#{o.order_number ?? '—'}</td>
                        <td>{o.customer_name ?? 'Guest'}</td>
                        <td>
                          <span
                            className="dash-badge"
                            data-tone={STATE_TONE[o.state]}
                          >
                            {o.state.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="dash-num">{clock(o.placed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Recent activity</span>
            </div>
            <div className="dash-panel-body">
              {loading ? (
                <div className="dash-empty">Loading…</div>
              ) : activity.length === 0 ? (
                <div className="dash-empty">No recent activity.</div>
              ) : (
                <div className="dash-feed">
                  {activity.map((a) => (
                    <div className="dash-feed-item" key={a.id}>
                      <span className="dash-feed-dot" />
                      <div>
                        <div className="dash-feed-text">{a.text}</div>
                        <div className="dash-feed-time">{clock(a.at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
