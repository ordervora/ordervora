'use client';

/**
 * OrdersManager — live order management.
 *
 * A searchable, filterable table of orders updated in real time. Selecting an
 * order opens a detail view with its items, modifiers, customer, financial
 * breakdown, and actions: refund (manager-tier), cancel, and print receipt. The
 * financial figures come from the manager-tier financials service — appropriate
 * here, where revenue visibility is the point.
 */

import { useMemo, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';
import { useDashboard } from '@/lib/dashboard/context';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { orderService, financialsService } from '@/lib/services';
import { refundOrder, advanceOrder } from '@/lib/dashboard/actions';
import { money, clock, dateTime, printHtml } from '@/lib/dashboard/utils';
import type { Order, OrderDetail } from '@/lib/services/order.service';
import type { OrderFinancials } from '@/lib/services/financials.service';
import type { OrderState } from '@/config/constants';

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

type FilterKey = 'all' | 'active' | 'completed' | 'cancelled';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled / Refunded' },
];

function matchesFilter(state: OrderState, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'completed') return state === 'completed';
  if (filter === 'cancelled') return state === 'cancelled' || state === 'refunded';
  return !['completed', 'cancelled', 'refunded'].includes(state);
}

export function OrdersManager() {
  const { restaurant, role, isPlatformAdmin } = useDashboard();
  const currency = restaurant.currency;
  const canRefund = isPlatformAdmin || role === 'owner' || role === 'manager';

  // Live, but seeded from a broad initial list so history is visible too.
  const { orders, refetch } = useRealtimeOrders(restaurant.id, { limit: 200 });

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [financials, setFinancials] = useState<OrderFinancials | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (!matchesFilter(o.state, filter)) return false;
      if (!q) return true;
      return (
        String(o.order_number ?? '').includes(q) ||
        (o.customer_name ?? '').toLowerCase().includes(q) ||
        (o.customer_phone ?? '').toLowerCase().includes(q)
      );
    });
  }, [orders, filter, query]);

  async function openOrder(order: Order) {
    setActionError(null);
    const client = getBrowserClient();
    const [detail, fin] = await Promise.all([
      orderService.getOrderDetail(client, order.id),
      financialsService.getOrderFinancials(client, order.id),
    ]);
    if (!detail.error) setSelected(detail.data);
    setFinancials(fin.error ? null : fin.data);
  }

  async function handleRefund() {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    const result = await refundOrder(selected.id);
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setSelected(null);
    await refetch();
  }

  async function handleCancel() {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    const result = await advanceOrder(selected.id, 'cancelled');
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setSelected(null);
    await refetch();
  }

  function handlePrint() {
    if (!selected) return;
    const lines = selected.order_items
      .map((item) => {
        const mods =
          item.order_item_modifiers.length > 0
            ? `<div class="muted">${item.order_item_modifiers
                .map((m) => m.modifier_name_snapshot)
                .join(', ')}</div>`
            : '';
        return `<tr><td>${item.quantity}× ${item.name_snapshot}${mods}</td></tr>`;
      })
      .join('');

    const totals = financials
      ? `<hr><table>
          <tr><td>Subtotal</td><td class="r">${money(financials.subtotal, currency)}</td></tr>
          ${financials.discount > 0 ? `<tr><td>Discount</td><td class="r">-${money(financials.discount, currency)}</td></tr>` : ''}
          ${financials.delivery_fee > 0 ? `<tr><td>Delivery</td><td class="r">${money(financials.delivery_fee, currency)}</td></tr>` : ''}
          <tr><td>Tax</td><td class="r">${money(financials.tax, currency)}</td></tr>
          ${financials.tip > 0 ? `<tr><td>Tip</td><td class="r">${money(financials.tip, currency)}</td></tr>` : ''}
          <tr><td class="tot">Total</td><td class="r tot">${money(financials.total, currency)}</td></tr>
        </table>`
      : '';

    printHtml(
      `Receipt #${selected.order_number ?? ''}`,
      `<h1>${restaurant.name}</h1>
       <div class="muted">Order #${selected.order_number ?? ''} · ${dateTime(selected.placed_at)}</div>
       <div class="muted">${selected.fulfillment} · ${selected.customer_name ?? 'Guest'}</div>
       <table>${lines}</table>${totals}`,
    );
  }

  return (
    <>
      <header className="dash-head">
        <div>
          <h1>Orders</h1>
          <div className="dash-head-sub">{filtered.length} shown</div>
        </div>
        <button className="dash-btn" onClick={() => void refetch()}>
          Refresh
        </button>
      </header>

      <div className="dash-body">
        <div className="dash-toolbar">
          <div className="dash-search">
            <input
              className="dash-input"
              placeholder="Search by order #, name, or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="dash-filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className="dash-filter"
                data-active={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dash-panel">
          <div className="dash-panel-body" data-flush="true">
            {filtered.length === 0 ? (
              <div className="dash-empty">No orders match.</div>
            ) : (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Placed</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => (
                    <tr key={o.id}>
                      <td className="dash-strong">#{o.order_number ?? '—'}</td>
                      <td>
                        {o.customer_name ?? 'Guest'}
                        {o.is_vip && (
                          <span
                            className="dash-badge"
                            data-tone="vip"
                            style={{ marginLeft: 8 }}
                          >
                            VIP
                          </span>
                        )}
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>
                        {o.fulfillment}
                      </td>
                      <td>
                        <span className="dash-badge" data-tone={STATE_TONE[o.state]}>
                          {o.state.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="dash-num">{clock(o.placed_at)}</td>
                      <td className="dash-num">
                        <button
                          className="dash-btn"
                          data-size="sm"
                          onClick={() => void openOrder(o)}
                        >
                          Details
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

      {selected && (
        <div
          className="dash-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="dash-modal">
            <div className="dash-modal-head">
              <span className="dash-modal-title">
                Order #{selected.order_number ?? '—'}
              </span>
              <button className="dash-x" onClick={() => setSelected(null)}>
                ×
              </button>
            </div>
            <div className="dash-modal-body">
              <div className="dash-kv">
                <span className="dash-kv-label">Customer</span>
                <span className="dash-kv-value">
                  {selected.customer_name ?? 'Guest'}
                </span>
              </div>
              {selected.customer_phone && (
                <div className="dash-kv">
                  <span className="dash-kv-label">Phone</span>
                  <span className="dash-kv-value">{selected.customer_phone}</span>
                </div>
              )}
              <div className="dash-kv">
                <span className="dash-kv-label">Type</span>
                <span
                  className="dash-kv-value"
                  style={{ textTransform: 'capitalize' }}
                >
                  {selected.fulfillment}
                </span>
              </div>
              {selected.address && (
                <div className="dash-kv">
                  <span className="dash-kv-label">Address</span>
                  <span className="dash-kv-value">{selected.address}</span>
                </div>
              )}
              {selected.note && (
                <div className="dash-kv">
                  <span className="dash-kv-label">Note</span>
                  <span className="dash-kv-value">{selected.note}</span>
                </div>
              )}

              <div className="dash-divider" />

              <table className="dash-table">
                <tbody>
                  {selected.order_items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="dash-strong">
                          {item.quantity}× {item.name_snapshot}
                        </div>
                        {item.order_item_modifiers.length > 0 && (
                          <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                            {item.order_item_modifiers
                              .map((m) => m.modifier_name_snapshot)
                              .join(', ')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {financials && (
                <>
                  <div className="dash-divider" />
                  <div className="dash-kv">
                    <span className="dash-kv-label">Subtotal</span>
                    <span className="dash-kv-value">
                      {money(financials.subtotal, currency)}
                    </span>
                  </div>
                  {financials.discount > 0 && (
                    <div className="dash-kv">
                      <span className="dash-kv-label">Discount</span>
                      <span className="dash-kv-value">
                        −{money(financials.discount, currency)}
                      </span>
                    </div>
                  )}
                  {financials.delivery_fee > 0 && (
                    <div className="dash-kv">
                      <span className="dash-kv-label">Delivery</span>
                      <span className="dash-kv-value">
                        {money(financials.delivery_fee, currency)}
                      </span>
                    </div>
                  )}
                  <div className="dash-kv">
                    <span className="dash-kv-label">Tax</span>
                    <span className="dash-kv-value">
                      {money(financials.tax, currency)}
                    </span>
                  </div>
                  {financials.tip > 0 && (
                    <div className="dash-kv">
                      <span className="dash-kv-label">Tip</span>
                      <span className="dash-kv-value">
                        {money(financials.tip, currency)}
                      </span>
                    </div>
                  )}
                  <div className="dash-kv">
                    <span className="dash-kv-label dash-strong">Total</span>
                    <span className="dash-kv-value">
                      {money(financials.total, currency)}
                    </span>
                  </div>
                </>
              )}

              {actionError && (
                <div className="dash-error" style={{ marginTop: 14 }}>
                  {actionError}
                </div>
              )}
            </div>
            <div className="dash-modal-foot">
              <button className="dash-btn" onClick={handlePrint}>
                Print receipt
              </button>
              {!['completed', 'cancelled', 'refunded'].includes(
                selected.state,
              ) && (
                <button
                  className="dash-btn"
                  data-variant="danger"
                  disabled={busy}
                  onClick={handleCancel}
                >
                  Cancel order
                </button>
              )}
              {canRefund && selected.state !== 'refunded' && (
                <button
                  className="dash-btn"
                  data-variant="danger"
                  disabled={busy}
                  onClick={handleRefund}
                >
                  {busy ? 'Working…' : 'Refund'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
