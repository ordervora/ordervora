'use client';

/**
 * MenuManager — menu management.
 *
 * Lists the full menu by category with each product's price, tag, availability,
 * and stock. Inline controls toggle availability ("86" an item) and open an edit
 * modal for price, description, tag, and stock. Modifier groups and their options
 * are shown in a reference panel. Writes go through the menu service (manager-tier
 * under RLS); availability uses the kitchen-allowed single-column update.
 */

import { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';

import { getBrowserClient } from '@/lib/supabase/client';
import { useDashboard } from '@/lib/dashboard/context';
import { menuService } from '@/lib/services';
import { money } from '@/lib/dashboard/utils';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { SkeletonTable } from '@/components/dashboard/Skeleton';
import { Spinner } from '@/components/Spinner';
import type {
  MenuCategory,
  Product,
  ProductWithModifiers,
} from '@/lib/services/menu.service';

interface EditState {
  product: Product;
  price: string;
  description: string;
  tag: string;
  stock: string;
}

export function MenuManager() {
  const { restaurant } = useDashboard();
  const currency = restaurant.currency;

  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const client = getBrowserClient();
    const result = await menuService.getFullMenu(client, restaurant.id);
    setMenu(result.error ? [] : result.data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant.id]);

  async function toggleAvailability(product: ProductWithModifiers | Product) {
    const client = getBrowserClient();
    await menuService.setProductAvailability(
      client,
      product.id,
      !product.is_available,
    );
    await load();
  }

  function openEdit(product: Product) {
    setError(null);
    setEdit({
      product,
      price: String(product.price),
      description: product.description ?? '',
      tag: product.tag ?? '',
      stock: product.stock === null ? '' : String(product.stock),
    });
  }

  async function saveEdit() {
    if (!edit) return;
    const priceValue = Number(edit.price);
    if (!Number.isFinite(priceValue) || priceValue < 0) {
      setError('Enter a valid price.');
      return;
    }
    setSaving(true);
    setError(null);
    const client = getBrowserClient();
    const result = await menuService.updateProduct(client, edit.product.id, {
      price: priceValue,
      description: edit.description.trim() || null,
      tag: edit.tag.trim() || null,
      stock: edit.stock.trim() === '' ? null : Number(edit.stock),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setEdit(null);
    await load();
  }

  const allModifierGroups = menu
    .flatMap((c) => c.products)
    .flatMap((p) => p.modifiers);
  const uniqueGroups = Array.from(
    new Map(allModifierGroups.map((g) => [g.id, g])).values(),
  );

  return (
    <>
      <header className="dash-head">
        <div>
          <h1>Menu</h1>
          <div className="dash-head-sub">
            {menu.reduce((n, c) => n + c.products.length, 0)} products ·{' '}
            {menu.length} categories
          </div>
        </div>
      </header>

      <div className="dash-body">
        {loading ? (
          <div className="dash-grid" data-cols="2">
            <div className="dash-panel">
              <div className="dash-panel-body" data-flush="true">
                <SkeletonTable rows={6} columns={4} />
              </div>
            </div>
            <div className="dash-panel" style={{ alignSelf: 'flex-start' }}>
              <div className="dash-panel-body">
                <SkeletonTable rows={3} columns={1} />
              </div>
            </div>
          </div>
        ) : (
          <div className="dash-grid" data-cols="2">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {menu.map((category) => (
                <div className="dash-panel" key={category.id}>
                  <div className="dash-panel-head">
                    <span className="dash-panel-title">
                      {category.emoji ? `${category.emoji} ` : ''}
                      {category.name}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {category.products.length} items
                    </span>
                  </div>
                  <div className="dash-panel-body" data-flush="true">
                    <table className="dash-table">
                      <tbody>
                        {category.products.map((product) => (
                          <tr key={product.id}>
                            <td>
                              <div className="dash-strong">{product.name}</div>
                              <div
                                style={{ color: 'var(--muted)', fontSize: 12 }}
                              >
                                {product.tag ?? '—'}
                                {product.stock !== null &&
                                  ` · ${product.stock} in stock`}
                              </div>
                            </td>
                            <td className="dash-num dash-money">
                              {money(Number(product.price), currency)}
                            </td>
                            <td className="dash-num">
                              <button
                                className="dash-toggle"
                                data-on={product.is_available}
                                title={
                                  product.is_available
                                    ? 'Available — tap to 86'
                                    : '86’d — tap to restore'
                                }
                                onClick={() => void toggleAvailability(product)}
                              />
                            </td>
                            <td className="dash-num">
                              <button
                                className="dash-btn"
                                data-size="sm"
                                onClick={() => openEdit(product)}
                              >
                                Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            <div className="dash-panel" style={{ alignSelf: 'flex-start' }}>
              <div className="dash-panel-head">
                <span className="dash-panel-title">Modifier groups</span>
              </div>
              <div className="dash-panel-body">
                {uniqueGroups.length === 0 ? (
                  <EmptyState
                    icon={Layers}
                    title="No modifier groups"
                    description="Modifier groups created for your products will appear here."
                  />
                ) : (
                  <div className="dash-list">
                    {uniqueGroups.map((group) => (
                      <div key={group.id}>
                        <div className="dash-strong">
                          {group.name}
                          {group.is_required && (
                            <span
                              className="dash-badge"
                              data-tone="active"
                              style={{ marginLeft: 8 }}
                            >
                              Required
                            </span>
                          )}
                        </div>
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                          {group.modifier_options
                            .map(
                              (o) =>
                                `${o.name}${
                                  Number(o.price_delta) !== 0
                                    ? ` (+${money(Number(o.price_delta), currency)})`
                                    : ''
                                }`,
                            )
                            .join(' · ')}
                        </div>
                        <div className="dash-divider" style={{ margin: '10px 0' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {edit && (
        <div
          className="dash-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEdit(null);
          }}
        >
          <div className="dash-modal">
            <div className="dash-modal-head">
              <span className="dash-modal-title">Edit {edit.product.name}</span>
              <button className="dash-x" onClick={() => setEdit(null)}>
                ×
              </button>
            </div>
            <div className="dash-modal-body">
              <div className="dash-row2">
                <div className="dash-field">
                  <label>Price ({currency})</label>
                  <input
                    className="dash-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={edit.price}
                    onChange={(e) =>
                      setEdit({ ...edit, price: e.target.value })
                    }
                  />
                </div>
                <div className="dash-field">
                  <label>Stock (blank = untracked)</label>
                  <input
                    className="dash-input"
                    type="number"
                    min="0"
                    value={edit.stock}
                    onChange={(e) =>
                      setEdit({ ...edit, stock: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="dash-field">
                <label>Tag</label>
                <input
                  className="dash-input"
                  value={edit.tag}
                  placeholder="Best Seller, Vegan…"
                  onChange={(e) => setEdit({ ...edit, tag: e.target.value })}
                />
              </div>
              <div className="dash-field">
                <label>Description</label>
                <textarea
                  className="dash-textarea"
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                />
              </div>
              {error && <div className="dash-error">{error}</div>}
            </div>
            <div className="dash-modal-foot">
              <button className="dash-btn" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button
                className="dash-btn"
                data-variant="primary"
                disabled={saving}
                onClick={saveEdit}
              >
                {saving && <Spinner />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
