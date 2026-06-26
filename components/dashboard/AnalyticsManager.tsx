'use client';

/**
 * AnalyticsManager — reporting and exports.
 *
 * Aggregates revenue over a selectable window (7/30/90 days), product mix,
 * top customers, peak hours, and the daily sales trend. Exports the revenue
 * trend to CSV and opens a print-friendly PDF report. Revenue figures come from
 * the reports + financials services; this manager-tier surface is where that
 * visibility belongs. All scoped by restaurant_id.
 */

import { useEffect, useMemo, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';
import { useDashboard } from '@/lib/dashboard/context';
import { reportsService, orderService } from '@/lib/services';
import {
  money,
  count,
  dateOnly,
  lastDaysWindow,
  downloadCsv,
  printHtml,
} from '@/lib/dashboard/utils';

interface DayPoint {
  date: string;
  revenue: number;
}
interface NamedTotal {
  name: string;
  value: number;
}

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
] as const;

export function AnalyticsManager() {
  const { restaurant } = useDashboard();
  const currency = restaurant.currency;

  const [days, setDays] = useState<number>(30);
  const [revenue, setRevenue] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [aov, setAov] = useState(0);
  const [series, setSeries] = useState<DayPoint[]>([]);
  const [products, setProducts] = useState<NamedTotal[]>([]);
  const [customers, setCustomers] = useState<NamedTotal[]>([]);
  const [peakHours, setPeakHours] = useState<number[]>(Array(24).fill(0));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const client = getBrowserClient();
    const window = lastDaysWindow(days);

    async function load() {
      const [summary, daily, orders] = await Promise.all([
        reportsService.getRevenueSummary(client, restaurant.id, window),
        reportsService.getDailyRevenue(client, restaurant.id, window),
        orderService.listOrders(client, restaurant.id, { limit: 500 }),
      ]);
      if (!active) return;

      setRevenue(summary.error ? 0 : summary.data.revenue);
      setOrderCount(summary.error ? 0 : summary.data.orderCount);
      setAov(summary.error ? 0 : summary.data.averageOrderValue);
      setSeries(
        daily.error ? [] : daily.data.map((d) => ({ date: d.date, revenue: d.revenue })),
      );

      const windowOrders = orders.error
        ? []
        : orders.data.filter(
            (o) => new Date(o.placed_at) >= new Date(window.from),
          );

      // Peak hours by order count.
      const hours = Array(24).fill(0) as number[];
      for (const o of windowOrders) {
        const hour = new Date(o.placed_at).getHours();
        hours[hour] = (hours[hour] ?? 0) + 1;
      }
      setPeakHours(hours);

      // Product mix from order items of the window's orders.
      const ids = windowOrders.map((o) => o.id);
      if (ids.length > 0) {
        const { data: items } = await client
          .from('order_items')
          .select('name_snapshot, quantity, order_id')
          .in('order_id', ids);
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
        if (active) {
          setProducts(
            [...tally.entries()]
              .map(([name, value]) => ({ name, value }))
              .sort((a, b) => b.value - a.value)
              .slice(0, 8),
          );
        }
      } else {
        setProducts([]);
      }

      // Top customers by order count in the window.
      const custTally = new Map<string, number>();
      for (const o of windowOrders) {
        const key = o.customer_name ?? 'Guest';
        custTally.set(key, (custTally.get(key) ?? 0) + 1);
      }
      if (active) {
        setCustomers(
          [...custTally.entries()]
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8),
        );
      }

      if (active) setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [restaurant.id, days]);

  const maxDay = useMemo(
    () => Math.max(1, ...series.map((d) => d.revenue)),
    [series],
  );
  const maxHour = useMemo(() => Math.max(1, ...peakHours), [peakHours]);
  const maxProduct = useMemo(
    () => Math.max(1, ...products.map((p) => p.value)),
    [products],
  );

  function exportCsv() {
    downloadCsv(
      `revenue-${days}d.csv`,
      { date: 'Date', revenue: 'Revenue' },
      series.map((d) => ({ date: d.date, revenue: d.revenue.toFixed(2) })),
    );
  }

  function exportPdf() {
    const rows = series
      .map(
        (d) =>
          `<tr><td>${dateOnly(d.date)}</td><td class="r">${money(d.revenue, currency)}</td></tr>`,
      )
      .join('');
    printHtml(
      `${restaurant.name} — Revenue (${days}d)`,
      `<h1>${restaurant.name}</h1>
       <div class="muted">Revenue report · last ${days} days</div>
       <table>
         <tr><td>Total revenue</td><td class="r tot">${money(revenue, currency)}</td></tr>
         <tr><td>Orders</td><td class="r">${count(orderCount)}</td></tr>
         <tr><td>Average order</td><td class="r">${money(aov, currency)}</td></tr>
       </table><hr>
       <table><tr><td class="muted">Date</td><td class="r muted">Revenue</td></tr>${rows}</table>`,
    );
  }

  return (
    <>
      <header className="dash-head">
        <div>
          <h1>Analytics</h1>
          <div className="dash-head-sub">Revenue, products, customers</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="dash-btn" onClick={exportCsv}>
            Export CSV
          </button>
          <button className="dash-btn" data-variant="primary" onClick={exportPdf}>
            Export PDF
          </button>
        </div>
      </header>

      <div className="dash-body">
        <div className="dash-toolbar">
          <div className="dash-filters">
            {RANGES.map((r) => (
              <button
                key={r.days}
                className="dash-filter"
                data-active={days === r.days}
                onClick={() => setDays(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dash-kpis">
          <div className="dash-kpi" data-tone="green">
            <div className="dash-kpi-label">Revenue</div>
            <div className="dash-kpi-value">{money(revenue, currency)}</div>
            <div className="dash-kpi-sub">last {days} days</div>
          </div>
          <div className="dash-kpi">
            <div className="dash-kpi-label">Orders</div>
            <div className="dash-kpi-value">{count(orderCount)}</div>
            <div className="dash-kpi-sub">completed sales</div>
          </div>
          <div className="dash-kpi" data-tone="brass">
            <div className="dash-kpi-label">Avg order value</div>
            <div className="dash-kpi-value">{money(aov, currency)}</div>
            <div className="dash-kpi-sub">last {days} days</div>
          </div>
        </div>

        <div className="dash-panel" style={{ marginBottom: 16 }}>
          <div className="dash-panel-head">
            <span className="dash-panel-title">Sales trend</span>
          </div>
          <div className="dash-panel-body">
            {loading ? (
              <div className="dash-empty">Loading…</div>
            ) : series.length === 0 ? (
              <div className="dash-empty">No sales in this period.</div>
            ) : (
              <div className="dash-chart">
                {series.map((d) => (
                  <div className="dash-chart-col" key={d.date}>
                    <div
                      className="dash-chart-bar"
                      style={{ height: `${(d.revenue / maxDay) * 100}%` }}
                      title={`${dateOnly(d.date)}: ${money(d.revenue, currency)}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="dash-grid" data-cols="2" style={{ marginBottom: 16 }}>
          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Top products</span>
            </div>
            <div className="dash-panel-body">
              {products.length === 0 ? (
                <div className="dash-empty">No data.</div>
              ) : (
                <div className="dash-bars">
                  {products.map((p) => (
                    <div key={p.name}>
                      <div className="dash-bar-row">
                        <span className="dash-bar-label">{p.name}</span>
                        <span className="dash-bar-value">{p.value}</span>
                      </div>
                      <div className="dash-bar-track">
                        <div
                          className="dash-bar-fill"
                          style={{ width: `${(p.value / maxProduct) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Top customers</span>
            </div>
            <div className="dash-panel-body" data-flush="true">
              {customers.length === 0 ? (
                <div className="dash-empty">No data.</div>
              ) : (
                <table className="dash-table">
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.name}>
                        <td className="dash-strong">{c.name}</td>
                        <td className="dash-num">{c.value} orders</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-head">
            <span className="dash-panel-title">Peak hours</span>
          </div>
          <div className="dash-panel-body">
            <div className="dash-chart" style={{ height: 130 }}>
              {peakHours.map((n, hour) => (
                <div className="dash-chart-col" key={hour}>
                  <div
                    className="dash-chart-bar"
                    data-soft={n === 0}
                    style={{ height: `${(n / maxHour) * 100}%` }}
                    title={`${hour}:00 — ${n} orders`}
                  />
                  {hour % 3 === 0 && (
                    <span className="dash-chart-label">{hour}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
