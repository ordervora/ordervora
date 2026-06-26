'use client';

/**
 * Cart provider.
 *
 * Holds the cart for the current restaurant in React state, persisted to
 * localStorage so a reload or a walk down the block doesn't lose the order. The
 * cart is scoped by restaurant id: switching restaurants starts a fresh cart.
 * All money shown from here is an estimate; checkout is authoritative.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type {
  CartState,
  CartLine,
  CartModifier,
  Fulfillment,
  AppliedCoupon,
} from './types';

function storageKey(restaurantId: string): string {
  return `ordervora.cart.${restaurantId}`;
}

function emptyCart(restaurantId: string): CartState {
  return {
    restaurantId,
    lines: [],
    fulfillment: 'pickup',
    coupon: null,
    tip: 0,
    scheduledFor: null,
  };
}

function readStored(restaurantId: string): CartState {
  if (typeof window === 'undefined') return emptyCart(restaurantId);
  try {
    const raw = window.localStorage.getItem(storageKey(restaurantId));
    if (!raw) return emptyCart(restaurantId);
    const parsed = JSON.parse(raw) as CartState;
    if (parsed.restaurantId !== restaurantId) return emptyCart(restaurantId);
    return parsed;
  } catch {
    return emptyCart(restaurantId);
  }
}

/** Generates a stable client line id. */
function makeLineId(): string {
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Two lines are mergeable when the product and its modifier set match. */
function sameSelection(a: CartLine, b: Omit<CartLine, 'lineId' | 'quantity'>): boolean {
  if (a.productId !== b.productId) return false;
  if (a.modifiers.length !== b.modifiers.length) return false;
  const aIds = a.modifiers.map((m) => m.optionId).sort();
  const bIds = b.modifiers.map((m) => m.optionId).sort();
  return aIds.every((id, i) => id === bIds[i]);
}

export interface AddLineInput {
  productId: string;
  name: string;
  unitPrice: number;
  imageUrl: string | null;
  quantity: number;
  modifiers: CartModifier[];
}

export interface CartContextValue {
  cart: CartState;
  itemCount: number;
  addLine: (input: AddLineInput) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  setFulfillment: (fulfillment: Fulfillment) => void;
  setTip: (tip: number) => void;
  setScheduledFor: (iso: string | null) => void;
  applyCoupon: (coupon: AppliedCoupon) => void;
  clearCoupon: () => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  restaurantId,
  children,
}: {
  restaurantId: string;
  children: ReactNode;
}) {
  const [cart, setCart] = useState<CartState>(() => emptyCart(restaurantId));

  // Hydrate from storage after mount (avoids SSR mismatch).
  useEffect(() => {
    setCart(readStored(restaurantId));
  }, [restaurantId]);

  // Persist on every change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey(restaurantId), JSON.stringify(cart));
  }, [restaurantId, cart]);

  const addLine = useCallback((input: AddLineInput) => {
    setCart((prev) => {
      const candidate = {
        productId: input.productId,
        name: input.name,
        unitPrice: input.unitPrice,
        imageUrl: input.imageUrl,
        modifiers: input.modifiers,
      };
      const existingIndex = prev.lines.findIndex((line) =>
        sameSelection(line, candidate),
      );

      if (existingIndex >= 0) {
        const lines = prev.lines.slice();
        const existing = lines[existingIndex]!;
        lines[existingIndex] = {
          ...existing,
          quantity: existing.quantity + input.quantity,
        };
        return { ...prev, lines };
      }

      const newLine: CartLine = {
        lineId: makeLineId(),
        ...candidate,
        quantity: input.quantity,
      };
      return { ...prev, lines: [...prev.lines, newLine] };
    });
  }, []);

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    setCart((prev) => {
      if (quantity <= 0) {
        return { ...prev, lines: prev.lines.filter((l) => l.lineId !== lineId) };
      }
      return {
        ...prev,
        lines: prev.lines.map((l) =>
          l.lineId === lineId ? { ...l, quantity } : l,
        ),
      };
    });
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setCart((prev) => ({
      ...prev,
      lines: prev.lines.filter((l) => l.lineId !== lineId),
    }));
  }, []);

  const setFulfillment = useCallback((fulfillment: Fulfillment) => {
    setCart((prev) => ({ ...prev, fulfillment }));
  }, []);

  const setTip = useCallback((tip: number) => {
    setCart((prev) => ({ ...prev, tip: Math.max(0, tip) }));
  }, []);

  const setScheduledFor = useCallback((iso: string | null) => {
    setCart((prev) => ({ ...prev, scheduledFor: iso }));
  }, []);

  const applyCoupon = useCallback((coupon: AppliedCoupon) => {
    setCart((prev) => ({ ...prev, coupon }));
  }, []);

  const clearCoupon = useCallback(() => {
    setCart((prev) => ({ ...prev, coupon: null }));
  }, []);

  const clearCart = useCallback(() => {
    setCart(emptyCart(restaurantId));
  }, [restaurantId]);

  const itemCount = useMemo(
    () => cart.lines.reduce((sum, line) => sum + line.quantity, 0),
    [cart.lines],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      itemCount,
      addLine,
      updateQuantity,
      removeLine,
      setFulfillment,
      setTip,
      setScheduledFor,
      applyCoupon,
      clearCoupon,
      clearCart,
    }),
    [
      cart,
      itemCount,
      addLine,
      updateQuantity,
      removeLine,
      setFulfillment,
      setTip,
      setScheduledFor,
      applyCoupon,
      clearCoupon,
      clearCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** Access the cart. Throws if used outside a CartProvider. */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider.');
  }
  return ctx;
}
