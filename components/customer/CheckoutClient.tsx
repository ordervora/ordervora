'use client';

/**
 * CheckoutClient — the order review and payment flow.
 *
 * Steps, all on one scrollable mobile screen:
 *   1. Review the cart (edit quantities, remove lines).
 *   2. Choose pickup or delivery; for delivery, capture an address.
 *   3. Optionally schedule the order for later instead of ASAP.
 *   4. Apply a coupon (validated server-side) and pick a tip.
 *   5. Identify: signed-in customer, or guest with name + phone.
 *   6. Pay via the Stripe Payment Element, created by the checkout function.
 *
 * Pricing shown is an estimate; the checkout function reprices authoritatively
 * and returns the real total alongside the Stripe client secret.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Restaurant } from '@/lib/services/restaurant.service';
import { useCart } from '@/lib/cart/CartProvider';
import { useAuth } from '@/hooks/useAuth';
import { useCustomer } from '@/hooks/useCustomer';
import { estimateCart, lineTotal, formatMoney } from '@/lib/cart/pricing';
import { validateCoupon, submitCheckout } from '@/lib/cart/checkout-client';
import { clientEnv } from '@/config/env';
import { AuthPanel, type GuestDetails } from './AuthPanel';
import { PaymentForm } from './PaymentForm';

const TIP_PRESETS = [0, 0.15, 0.18, 0.2] as const;

export interface CheckoutClientProps {
  restaurant: Restaurant;
  /** Delivery fee configured for this restaurant (major units). */
  deliveryFee: number;
  /** The restaurant's Stripe connected account id, for the Payment Element. */
  stripeAccountId: string | null;
}

export function CheckoutClient({
  restaurant,
  deliveryFee,
  stripeAccountId,
}: CheckoutClientProps) {
  const router = useRouter();
  const { cart, updateQuantity, removeLine, setFulfillment, setTip, applyCoupon, clearCoupon, setScheduledFor, clearCart } =
    useCart();
  const { user } = useAuth();
  const { customer } = useCustomer(restaurant.id);

  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponError, setCouponError] = useState(false);
  const [tipChoice, setTipChoice] = useState<number>(0);
  const [guest, setGuest] = useState<GuestDetails | null>(null);
  const [scheduleMode, setScheduleMode] = useState<'asap' | 'later'>('asap');

  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [payment, setPayment] = useState<{
    clientSecret: string;
    orderId: string;
  } | null>(null);

  const subtotalEstimate = useMemo(
    () => cart.lines.reduce((sum, line) => sum + lineTotal(line), 0),
    [cart.lines],
  );

  // Tip resolves from a percentage preset against the current subtotal.
  useEffect(() => {
    const tipAmount = Math.round(subtotalEstimate * tipChoice * 100) / 100;
    setTip(tipAmount);
  }, [tipChoice, subtotalEstimate, setTip]);

  const estimate = estimateCart({
    lines: cart.lines,
    taxRate: Number(restaurant.tax_rate),
    fulfillment: cart.fulfillment,
    deliveryFee,
    tip: cart.tip,
    discount: cart.coupon?.discount ?? 0,
  });

  const canIdentify = Boolean(user) || Boolean(guest);
  const needsAddress = cart.fulfillment === 'delivery';
  const addressOk = !needsAddress || address.trim().length > 0;

  async function handleApplyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    const result = await validateCoupon({
      restaurantId: restaurant.id,
      code,
      subtotal: subtotalEstimate,
      deliveryFee: cart.fulfillment === 'delivery' ? deliveryFee : 0,
      customerId: customer?.id ?? null,
    });
    if (result.valid) {
      applyCoupon({ code, discount: result.discount });
      setCouponMessage(`Applied — you save ${formatMoney(result.discount, restaurant.currency)}.`);
      setCouponError(false);
    } else {
      clearCoupon();
      setCouponMessage(result.reason ?? 'That code is not valid.');
      setCouponError(true);
    }
  }

  async function handlePlaceOrder() {
    setPlacing(true);
    setPlaceError(null);

    const result = await submitCheckout({
      cart,
      customer: {
        id: customer?.id ?? null,
        name: customer?.name ?? guest?.name ?? null,
        phone: customer?.phone ?? guest?.phone ?? null,
      },
      address: needsAddress ? address.trim() : null,
      note: note.trim() ? note.trim() : null,
      deliveryFee,
    });

    if (!result.ok || !result.orderId) {
      setPlaceError(result.error ?? 'Could not place the order.');
      setPlacing(false);
      return;
    }

    // If the restaurant uses a payment method requiring the Element, show it;
    // otherwise (no secret) the order is already moving and we go to tracking.
    if (result.clientSecret && stripeAccountId && clientEnv.stripePublishableKey) {
      setPayment({ clientSecret: result.clientSecret, orderId: result.orderId });
      setPlacing(false);
    } else {
      clearCart();
      router.push(`/${restaurant.slug}/track/${result.orderId}`);
    }
  }

  function handlePaymentSuccess(orderId: string) {
    clearCart();
    router.push(`/${restaurant.slug}/track/${orderId}`);
  }

  if (cart.lines.length === 0 && !payment) {
    return (
      <div className="ov-shell">
        <div className="ov-topbar">
          <button className="ov-back" onClick={() => router.push(`/${restaurant.slug}`)}>
            ← Menu
          </button>
          <h1>Checkout</h1>
        </div>
        <div className="ov-empty">
          Your cart is empty.{' '}
          <button className="ov-link" onClick={() => router.push(`/${restaurant.slug}`)}>
            Browse the menu
          </button>
        </div>
      </div>
    );
  }

  // Payment step.
  if (payment && stripeAccountId && clientEnv.stripePublishableKey) {
    return (
      <div className="ov-shell">
        <div className="ov-topbar">
          <h1>Payment</h1>
        </div>
        <div className="ov-pad ov-stack">
          <div className="ov-card">
            <div className="ov-row" data-total="true">
              <span className="ov-row-label">Total</span>
              <span className="ov-row-value">
                {formatMoney(estimate.total, restaurant.currency)}
              </span>
            </div>
          </div>
          <div className="ov-card">
            <PaymentForm
              publishableKey={clientEnv.stripePublishableKey}
              connectedAccountId={stripeAccountId}
              clientSecret={payment.clientSecret}
              returnUrl={`${clientEnv.siteUrl}/${restaurant.slug}/track/${payment.orderId}`}
              onSuccess={() => handlePaymentSuccess(payment.orderId)}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ov-shell">
      <div className="ov-topbar">
        <button className="ov-back" onClick={() => router.push(`/${restaurant.slug}`)}>
          ← Menu
        </button>
        <h1>Checkout</h1>
      </div>

      <div className="ov-pad ov-stack">
        {/* cart review */}
        <div className="ov-card">
          <div className="ov-stack">
            {cart.lines.map((line) => (
              <div className="ov-row" key={line.lineId} style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{line.name}</div>
                  {line.modifiers.length > 0 && (
                    <div className="ov-note">
                      {line.modifiers.map((m) => m.name).join(', ')}
                    </div>
                  )}
                  <div className="ov-qty" style={{ marginTop: 8, width: 'fit-content' }}>
                    <button
                      type="button"
                      aria-label="Decrease"
                      onClick={() => updateQuantity(line.lineId, line.quantity - 1)}
                    >
                      −
                    </button>
                    <span>{line.quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase"
                      onClick={() => updateQuantity(line.lineId, line.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="ov-row-value">
                    {formatMoney(lineTotal(line), restaurant.currency)}
                  </div>
                  <button
                    className="ov-link"
                    style={{ fontSize: 12, color: 'var(--danger)' }}
                    onClick={() => removeLine(line.lineId)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* fulfillment */}
        <div className="ov-card">
          <div className="ov-fulfillment" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="ov-seg"
              data-active={cart.fulfillment === 'pickup'}
              onClick={() => setFulfillment('pickup')}
            >
              Pickup
            </button>
            <button
              type="button"
              className="ov-seg"
              data-active={cart.fulfillment === 'delivery'}
              onClick={() => setFulfillment('delivery')}
            >
              Delivery
            </button>
          </div>

          {needsAddress && (
            <div className="ov-field" style={{ marginTop: 12 }}>
              <label htmlFor="address">Delivery address</label>
              <input
                id="address"
                className="ov-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, apt, city"
                autoComplete="street-address"
              />
            </div>
          )}

          <div className="ov-field" style={{ marginTop: 12 }}>
            <label htmlFor="note">Order note (optional)</label>
            <textarea
              id="note"
              className="ov-textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Allergies, buzzer code, extra napkins…"
            />
          </div>
        </div>

        {/* schedule */}
        <div className="ov-card">
          <span className="ov-field-label" style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)' }}>
            When
          </span>
          <div className="ov-fulfillment" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="ov-seg"
              data-active={scheduleMode === 'asap'}
              onClick={() => {
                setScheduleMode('asap');
                setScheduledFor(null);
              }}
            >
              ASAP
            </button>
            <button
              type="button"
              className="ov-seg"
              data-active={scheduleMode === 'later'}
              onClick={() => setScheduleMode('later')}
            >
              Schedule
            </button>
          </div>
          {scheduleMode === 'later' && (
            <div className="ov-field" style={{ marginTop: 12 }}>
              <label htmlFor="schedule">Pick a time</label>
              <input
                id="schedule"
                className="ov-input"
                type="datetime-local"
                onChange={(e) =>
                  setScheduledFor(e.target.value ? new Date(e.target.value).toISOString() : null)
                }
              />
            </div>
          )}
        </div>

        {/* coupon + tip */}
        <div className="ov-card">
          <div className="ov-coupon">
            <input
              className="ov-input"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder="Coupon code"
              autoCapitalize="characters"
            />
            <button type="button" className="ov-btn" data-variant="ink" onClick={handleApplyCoupon}>
              Apply
            </button>
          </div>
          {couponMessage && (
            <p className={couponError ? 'ov-error' : 'ov-success'} style={{ marginTop: 10 }}>
              {couponMessage}
            </p>
          )}

          <div className="ov-divider" />

          <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)' }}>
            Tip
          </span>
          <div className="ov-tips" style={{ marginTop: 8 }}>
            {TIP_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="ov-tip"
                data-active={tipChoice === preset}
                onClick={() => setTipChoice(preset)}
              >
                {preset === 0 ? 'None' : `${Math.round(preset * 100)}%`}
              </button>
            ))}
          </div>
        </div>

        {/* totals */}
        <div className="ov-card">
          <div className="ov-row">
            <span className="ov-row-label">Subtotal</span>
            <span className="ov-row-value">{formatMoney(estimate.subtotal, restaurant.currency)}</span>
          </div>
          {estimate.discount > 0 && (
            <div className="ov-row">
              <span className="ov-row-label">Discount</span>
              <span className="ov-row-value" style={{ color: 'var(--fresh)' }}>
                −{formatMoney(estimate.discount, restaurant.currency)}
              </span>
            </div>
          )}
          {estimate.deliveryFee > 0 && (
            <div className="ov-row">
              <span className="ov-row-label">Delivery</span>
              <span className="ov-row-value">{formatMoney(estimate.deliveryFee, restaurant.currency)}</span>
            </div>
          )}
          <div className="ov-row">
            <span className="ov-row-label">Tax</span>
            <span className="ov-row-value">{formatMoney(estimate.tax, restaurant.currency)}</span>
          </div>
          {estimate.tip > 0 && (
            <div className="ov-row">
              <span className="ov-row-label">Tip</span>
              <span className="ov-row-value">{formatMoney(estimate.tip, restaurant.currency)}</span>
            </div>
          )}
          <div className="ov-divider" />
          <div className="ov-row" data-total="true">
            <span className="ov-row-label">Total</span>
            <span className="ov-row-value">{formatMoney(estimate.total, restaurant.currency)}</span>
          </div>
          <p className="ov-note" style={{ marginTop: 8 }}>
            Final total is confirmed securely at payment.
          </p>
        </div>

        {/* identify */}
        {!canIdentify ? (
          <AuthPanel
            redirectTo={`/${restaurant.slug}/checkout`}
            allowGuest
            onGuestContinue={setGuest}
          />
        ) : (
          <>
            {placeError && <div className="ov-error">{placeError}</div>}
            <button
              type="button"
              className="ov-btn"
              data-block="true"
              disabled={placing || !addressOk}
              onClick={handlePlaceOrder}
            >
              {placing
                ? 'Placing…'
                : `Place order · ${formatMoney(estimate.total, restaurant.currency)}`}
            </button>
            {!addressOk && (
              <p className="ov-note">Add a delivery address to continue.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
