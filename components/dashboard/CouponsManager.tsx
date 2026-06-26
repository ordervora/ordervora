'use client';

/**
 * CouponsManager — coupon management.
 *
 * Lists coupons with type, value, usage vs. limit, expiry, and active state.
 * Create and edit through a modal covering all coupon fields including the
 * per-customer limit and expiration. Usage analytics (uses vs. limit) are read
 * straight from the coupon row, kept honest by the redemption reconciliation
 * trigger.
 */

import { useEffect, useState } from 'react';

import { getBrowserClient } from '@/lib/supabase/client';
import { useDashboard } from '@/lib/dashboard/context';
import { couponService } from '@/lib/services';
import { dateOnly } from '@/lib/dashboard/utils';
import type { Coupon } from '@/lib/services/coupon.service';
import type { CouponType } from '@/config/constants';

interface FormState {
  id: string | null;
  code: string;
  type: CouponType;
  value: string;
  minSubtotal: string;
  usageLimit: string;
  perCustomerLimit: string;
  expiresAt: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  id: null,
  code: '',
  type: 'percent',
  value: '',
  minSubtotal: '0',
  usageLimit: '',
  perCustomerLimit: '',
  expiresAt: '',
  isActive: true,
};

const TYPE_LABEL: Record<CouponType, string> = {
  percent: '% off',
  fixed: 'Amount off',
  free_delivery: 'Free delivery',
  free_item: 'Free item',
};

export function CouponsManager() {
  const { restaurant } = useDashboard();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const client = getBrowserClient();
    const result = await couponService.listCoupons(client, restaurant.id);
    setCoupons(result.error ? [] : result.data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.id]);

  function openCreate() {
    setError(null);
    setForm({ ...EMPTY_FORM });
  }

  function openEdit(coupon: Coupon) {
    setError(null);
    setForm({
      id: coupon.id,
      code: coupon.code,
      type: coupon.type,
      value: String(coupon.value),
      minSubtotal: String(coupon.min_subtotal),
      usageLimit: coupon.usage_limit === null ? '' : String(coupon.usage_limit),
      perCustomerLimit:
        coupon.per_customer_limit === null
          ? ''
          : String(coupon.per_customer_limit),
      expiresAt: coupon.expires_at ? coupon.expires_at.slice(0, 10) : '',
      isActive: coupon.is_active,
    });
  }

  async function save() {
    if (!form) return;
    if (!form.code.trim()) {
      setError('Enter a code.');
      return;
    }
    setSaving(true);
    setError(null);
    const client = getBrowserClient();

    const payload = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: Number(form.value) || 0,
      min_subtotal: Number(form.minSubtotal) || 0,
      usage_limit: form.usageLimit.trim() === '' ? null : Number(form.usageLimit),
      per_customer_limit:
        form.perCustomerLimit.trim() === ''
          ? null
          : Number(form.perCustomerLimit),
      expires_at: form.expiresAt
        ? new Date(form.expiresAt).toISOString()
        : null,
      is_active: form.isActive,
    };

    const result = form.id
      ? await couponService.updateCoupon(client, form.id, payload)
      : await couponService.createCoupon(client, {
          restaurant_id: restaurant.id,
          ...payload,
        });

    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setForm(null);
    await load();
  }

  return (
    <>
      <header className="dash-head">
        <div>
          <h1>Coupons</h1>
          <div className="dash-head-sub">{coupons.length} total</div>
        </div>
        <button className="dash-btn" data-variant="primary" onClick={openCreate}>
          New coupon
        </button>
      </header>

      <div className="dash-body">
        <div className="dash-panel">
          <div className="dash-panel-body" data-flush="true">
            {loading ? (
              <div className="dash-empty">Loading…</div>
            ) : coupons.length === 0 ? (
              <div className="dash-empty">No coupons yet.</div>
            ) : (
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Type</th>
                    <th className="dash-num">Used</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((c) => (
                    <tr key={c.id}>
                      <td className="dash-strong">{c.code}</td>
                      <td>
                        {TYPE_LABEL[c.type]}
                        {c.type === 'percent' && ` (${c.value}%)`}
                        {c.type === 'fixed' && ` (${c.value})`}
                      </td>
                      <td className="dash-num">
                        {c.uses_count}
                        {c.usage_limit !== null ? ` / ${c.usage_limit}` : ''}
                      </td>
                      <td>{c.expires_at ? dateOnly(c.expires_at) : 'Never'}</td>
                      <td>
                        <span
                          className="dash-badge"
                          data-tone={c.is_active ? 'ready' : 'dead'}
                        >
                          {c.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="dash-num">
                        <button
                          className="dash-btn"
                          data-size="sm"
                          onClick={() => openEdit(c)}
                        >
                          Edit
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

      {form && (
        <div
          className="dash-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setForm(null);
          }}
        >
          <div className="dash-modal">
            <div className="dash-modal-head">
              <span className="dash-modal-title">
                {form.id ? 'Edit coupon' : 'New coupon'}
              </span>
              <button className="dash-x" onClick={() => setForm(null)}>
                ×
              </button>
            </div>
            <div className="dash-modal-body">
              <div className="dash-row2">
                <div className="dash-field">
                  <label>Code</label>
                  <input
                    className="dash-input"
                    value={form.code}
                    onChange={(e) =>
                      setForm({ ...form, code: e.target.value })
                    }
                  />
                </div>
                <div className="dash-field">
                  <label>Type</label>
                  <select
                    className="dash-select"
                    value={form.type}
                    onChange={(e) =>
                      setForm({ ...form, type: e.target.value as CouponType })
                    }
                  >
                    <option value="percent">% off</option>
                    <option value="fixed">Amount off</option>
                    <option value="free_delivery">Free delivery</option>
                    <option value="free_item">Free item</option>
                  </select>
                </div>
              </div>
              <div className="dash-row2">
                <div className="dash-field">
                  <label>Value</label>
                  <input
                    className="dash-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.value}
                    onChange={(e) =>
                      setForm({ ...form, value: e.target.value })
                    }
                  />
                </div>
                <div className="dash-field">
                  <label>Min subtotal</label>
                  <input
                    className="dash-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.minSubtotal}
                    onChange={(e) =>
                      setForm({ ...form, minSubtotal: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="dash-row2">
                <div className="dash-field">
                  <label>Total uses limit</label>
                  <input
                    className="dash-input"
                    type="number"
                    min="0"
                    placeholder="Unlimited"
                    value={form.usageLimit}
                    onChange={(e) =>
                      setForm({ ...form, usageLimit: e.target.value })
                    }
                  />
                </div>
                <div className="dash-field">
                  <label>Per-customer limit</label>
                  <input
                    className="dash-input"
                    type="number"
                    min="0"
                    placeholder="Unlimited"
                    value={form.perCustomerLimit}
                    onChange={(e) =>
                      setForm({ ...form, perCustomerLimit: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="dash-field">
                <label>Expires (blank = never)</label>
                <input
                  className="dash-input"
                  type="date"
                  value={form.expiresAt}
                  onChange={(e) =>
                    setForm({ ...form, expiresAt: e.target.value })
                  }
                />
              </div>
              <div
                className="dash-kv"
                style={{ alignItems: 'center', marginTop: 4 }}
              >
                <span className="dash-kv-label">Active</span>
                <button
                  className="dash-toggle"
                  data-on={form.isActive}
                  onClick={() =>
                    setForm({ ...form, isActive: !form.isActive })
                  }
                />
              </div>
              {error && (
                <div className="dash-error" style={{ marginTop: 10 }}>
                  {error}
                </div>
              )}
            </div>
            <div className="dash-modal-foot">
              <button className="dash-btn" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button
                className="dash-btn"
                data-variant="primary"
                disabled={saving}
                onClick={save}
              >
                {saving ? 'Saving…' : 'Save coupon'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
