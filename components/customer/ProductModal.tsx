'use client';

/**
 * ProductModal — the product detail bottom sheet.
 *
 * Shows the product image, description, and nutrition, then its modifier groups
 * with their selection rules (required, single-select via radio, multi-select up
 * to a max). Enforces those rules before letting the customer add to the cart at
 * the chosen quantity. Prices shown here are display estimates; the server
 * reprices at checkout.
 */

import { useMemo, useState } from 'react';

import type { ProductWithModifiers } from '@/lib/services/menu.service';
import type { CartModifier } from '@/lib/cart/types';
import { useCart } from '@/lib/cart/CartProvider';
import { formatMoney } from '@/lib/cart/pricing';

export interface ProductModalProps {
  product: ProductWithModifiers;
  currency: string;
  onClose: () => void;
}

export function ProductModal({ product, currency, onClose }: ProductModalProps) {
  const { addLine } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [attemptedAdd, setAttemptedAdd] = useState(false);

  const primaryImage =
    product.product_images.find((img) => img.is_primary)?.url ??
    product.product_images[0]?.url ??
    null;

  function toggleOption(
    modifierId: string,
    optionId: string,
    maxSelect: number | null,
  ): void {
    setSelected((prev) => {
      const current = new Set(prev[modifierId] ?? []);
      const isSingle = maxSelect === 1;

      if (current.has(optionId)) {
        current.delete(optionId);
      } else if (isSingle) {
        current.clear();
        current.add(optionId);
      } else {
        if (maxSelect !== null && current.size >= maxSelect) {
          // At the cap: replace the oldest selection to honor the max.
          const first = current.values().next().value as string | undefined;
          if (first) current.delete(first);
        }
        current.add(optionId);
      }

      return { ...prev, [modifierId]: current };
    });
  }

  // Which required groups are unsatisfied (for validation + highlighting).
  const unmetRequired = useMemo(() => {
    return product.modifiers
      .filter((group) => {
        const count = selected[group.id]?.size ?? 0;
        const min = group.is_required ? Math.max(1, group.min_select) : group.min_select;
        return count < min;
      })
      .map((group) => group.id);
  }, [product.modifiers, selected]);

  const chosenModifiers = useMemo<CartModifier[]>(() => {
    const result: CartModifier[] = [];
    for (const group of product.modifiers) {
      const ids = selected[group.id];
      if (!ids) continue;
      for (const option of group.modifier_options) {
        if (ids.has(option.id)) {
          result.push({
            optionId: option.id,
            modifierId: group.id,
            name: option.name,
            priceDelta: Number(option.price_delta),
          });
        }
      }
    }
    return result;
  }, [product.modifiers, selected]);

  const unitWithMods =
    Number(product.price) +
    chosenModifiers.reduce((sum, m) => sum + m.priceDelta, 0);
  const lineEstimate = unitWithMods * quantity;

  function handleAdd() {
    setAttemptedAdd(true);
    if (unmetRequired.length > 0) return;

    addLine({
      productId: product.id,
      name: product.name,
      unitPrice: Number(product.price),
      imageUrl: primaryImage,
      quantity,
      modifiers: chosenModifiers,
    });
    onClose();
  }

  return (
    <div
      className="ov-sheet-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ov-sheet" role="dialog" aria-label={product.name}>
        {primaryImage && (
          <img className="ov-sheet-img" src={primaryImage} alt={product.name} />
        )}
        <div className="ov-sheet-scroll">
          <div className="ov-sheet-title">{product.name}</div>
          {product.description && (
            <p className="ov-sheet-desc">{product.description}</p>
          )}
          {(product.calories !== null || product.protein !== null) && (
            <div className="ov-sheet-nutri">
              {product.calories !== null && <span>{product.calories} cal</span>}
              {product.protein !== null && <span>{product.protein}g protein</span>}
            </div>
          )}

          {product.modifiers.map((group) => {
            const groupSelected = selected[group.id] ?? new Set<string>();
            const isSingle = group.max_select === 1;
            const missing =
              attemptedAdd && unmetRequired.includes(group.id);
            const rule = isSingle
              ? 'Choose one'
              : group.max_select
                ? `Choose up to ${group.max_select}`
                : 'Choose any';

            return (
              <div className="ov-modgroup" key={group.id}>
                <div className="ov-modgroup-head">
                  <span className="ov-modgroup-name">
                    {group.name}
                    {group.is_required && (
                      <span className="ov-modgroup-req">Required</span>
                    )}
                  </span>
                  <span
                    className="ov-modgroup-rule"
                    style={missing ? { color: 'var(--danger)' } : undefined}
                  >
                    {missing ? 'Selection needed' : group.subtitle ?? rule}
                  </span>
                </div>

                {group.modifier_options.map((option) => {
                  const checked = groupSelected.has(option.id);
                  return (
                    <div
                      className="ov-option"
                      key={option.id}
                      data-radio={isSingle}
                      data-checked={checked}
                      onClick={() =>
                        toggleOption(group.id, option.id, group.max_select)
                      }
                    >
                      <span className="ov-option-box">
                        {checked && <span className="ov-option-tick" />}
                      </span>
                      <span className="ov-option-name">{option.name}</span>
                      {Number(option.price_delta) !== 0 && (
                        <span className="ov-option-price">
                          +{formatMoney(Number(option.price_delta), currency)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="ov-sheet-foot">
          <div className="ov-qty">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span>{quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQuantity((q) => q + 1)}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="ov-btn ov-btn-grow"
            onClick={handleAdd}
          >
            Add · {formatMoney(lineEstimate, currency)}
          </button>
        </div>
      </div>
    </div>
  );
}
