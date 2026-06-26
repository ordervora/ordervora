'use client';

/**
 * AddressesClient — manage saved delivery addresses.
 *
 * Lists the signed-in customer's saved addresses and lets them add or remove
 * them. Addresses are reused at checkout for delivery. RLS scopes every
 * operation to the customer's own records.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

import type { Restaurant } from '@/lib/services/restaurant.service';
import { getBrowserClient } from '@/lib/supabase/client';
import { customerService } from '@/lib/services';
import { useAuth } from '@/hooks/useAuth';
import type { CustomerAddress } from '@/lib/services/customer.service';
import { AuthPanel } from './AuthPanel';

export interface AddressesClientProps {
  restaurant: Restaurant;
}

export function AddressesClient({ restaurant }: AddressesClientProps) {
  const { user, loading: authLoading } = useAuth();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const client = getBrowserClient();
    customerService
      .getCurrentCustomer(client, restaurant.id, user.id)
      .then(async (result) => {
        if (!active) return;
        if (result.error || !result.data) {
          setLoading(false);
          return;
        }
        setCustomerId(result.data.id);
        const list = await customerService.listAddresses(client, result.data.id);
        if (!active) return;
        setAddresses(list.error ? [] : list.data);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [restaurant.id, user, authLoading]);

  async function handleAdd() {
    if (!customerId || !line1.trim()) return;
    setAdding(true);
    setError(null);

    const client = getBrowserClient();
    const result = await customerService.addAddress(client, {
      restaurant_id: restaurant.id,
      customer_id: customerId,
      label: 'home',
      line1: line1.trim(),
      city: city.trim() || null,
    });

    if (result.error) {
      setError(result.error.message);
      setAdding(false);
      return;
    }

    setAddresses((prev) => [...prev, result.data]);
    setLine1('');
    setCity('');
    setAdding(false);
  }

  async function handleDelete(addressId: string) {
    const client = getBrowserClient();
    const result = await customerService.deleteAddress(client, addressId);
    if (!result.error) {
      setAddresses((prev) => prev.filter((a) => a.id !== addressId));
    }
  }

  return (
    <div className="ov-shell">
      <div className="ov-topbar">
        <Link className="ov-back" href={`/${restaurant.slug}/account`}>
          ← Account
        </Link>
        <h1>Saved addresses</h1>
      </div>

      <div className="ov-pad ov-stack">
        {authLoading || loading ? (
          <div className="ov-empty">Loading…</div>
        ) : !user ? (
          <AuthPanel redirectTo={`/${restaurant.slug}/account/addresses`} />
        ) : (
          <>
            {addresses.length === 0 && (
              <div className="ov-note">No saved addresses yet.</div>
            )}
            {addresses.map((address) => (
              <div className="ov-card ov-row" key={address.id}>
                <div>
                  <div style={{ fontWeight: 700 }}>{address.line1}</div>
                  {address.city && (
                    <div className="ov-note">{address.city}</div>
                  )}
                </div>
                <button
                  className="ov-link"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => handleDelete(address.id)}
                >
                  Remove
                </button>
              </div>
            ))}

            <div className="ov-card ov-stack">
              <div className="ov-field">
                <label htmlFor="line1">Street address</label>
                <input
                  id="line1"
                  className="ov-input"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  autoComplete="address-line1"
                />
              </div>
              <div className="ov-field">
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  className="ov-input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  autoComplete="address-level2"
                />
              </div>
              {error && <div className="ov-error">{error}</div>}
              <button
                type="button"
                className="ov-btn"
                data-block="true"
                disabled={adding || !line1.trim()}
                onClick={handleAdd}
              >
                {adding ? 'Saving…' : 'Add address'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
