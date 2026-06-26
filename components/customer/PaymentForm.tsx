'use client';

/**
 * PaymentForm — Stripe Payment Element for confirming an order's payment.
 *
 * Loads Stripe.js for the restaurant's CONNECTED account (the PaymentIntent was
 * created there), mounts the Payment Element with the client secret returned by
 * checkout, and confirms the payment. On success the webhook moves the order to
 * accepted; the customer is sent to the live tracker. No card data touches our
 * servers — Stripe Elements handles it.
 *
 * Stripe.js is loaded from the official CDN on demand to avoid bundling it into
 * pages that never reach checkout.
 */

import { useEffect, useRef, useState } from 'react';

interface StripeLike {
  elements(options: { clientSecret: string }): StripeElements;
  confirmPayment(args: {
    elements: StripeElements;
    confirmParams: { return_url: string };
    redirect: 'if_required';
  }): Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>;
}

interface StripeElements {
  create(type: 'payment'): StripeElement;
  getElement(type: 'payment'): StripeElement | null;
  submit(): Promise<{ error?: { message?: string } }>;
}

interface StripeElement {
  mount(selector: string | HTMLElement): void;
}

type StripeFactory = (
  key: string,
  options?: { stripeAccount?: string },
) => StripeLike;

interface StripeWindow {
  Stripe?: StripeFactory;
}

const STRIPE_JS_URL = 'https://js.stripe.com/v3/';

function getStripeWindow(): StripeWindow & Window {
  return window as unknown as StripeWindow & Window;
}

function loadStripeJs(): Promise<StripeFactory> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Stripe.js can only load in the browser.'));
      return;
    }
    const w = getStripeWindow();
    if (w.Stripe) {
      resolve(w.Stripe);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${STRIPE_JS_URL}"]`,
    );
    const onLoad = () => {
      const ready = getStripeWindow().Stripe;
      if (ready) resolve(ready);
      else reject(new Error('Stripe.js failed to initialize.'));
    };
    if (existing) {
      existing.addEventListener('load', onLoad, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = STRIPE_JS_URL;
    script.async = true;
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', () =>
      reject(new Error('Could not load the payment form.')),
    );
    document.head.appendChild(script);
  });
}

export interface PaymentFormProps {
  publishableKey: string;
  connectedAccountId: string;
  clientSecret: string;
  returnUrl: string;
  onSuccess: () => void;
}

export function PaymentForm({
  publishableKey,
  connectedAccountId,
  clientSecret,
  returnUrl,
  onSuccess,
}: PaymentFormProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<StripeLike | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    loadStripeJs()
      .then((factory) => {
        if (!active || !containerRef.current) return;
        const stripe = factory(publishableKey, {
          stripeAccount: connectedAccountId,
        });
        const elements = stripe.elements({ clientSecret });
        const paymentElement = elements.create('payment');
        paymentElement.mount(containerRef.current);
        stripeRef.current = stripe;
        elementsRef.current = elements;
        setReady(true);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Payment unavailable.');
        }
      });

    return () => {
      active = false;
    };
  }, [publishableKey, connectedAccountId, clientSecret]);

  async function handlePay() {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);

    const submitResult = await elements.submit();
    if (submitResult.error) {
      setError(submitResult.error.message ?? 'Please check your card details.');
      setSubmitting(false);
      return;
    }

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: 'if_required',
    });

    if (result.error) {
      setError(result.error.message ?? 'Payment could not be completed.');
      setSubmitting(false);
      return;
    }

    if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
      onSuccess();
      return;
    }

    // Some methods complete via redirect; the return_url tracker handles those.
    setSubmitting(false);
  }

  return (
    <div className="ov-stack">
      <div ref={containerRef} />
      {error && <div className="ov-error">{error}</div>}
      <button
        type="button"
        className="ov-btn"
        data-block="true"
        disabled={!ready || submitting}
        onClick={handlePay}
      >
        {submitting ? 'Processing…' : 'Pay now'}
      </button>
    </div>
  );
}
