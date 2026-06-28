'use client';

/**
 * Restaurant setup wizard (Module A).
 *
 * Walks a brand-new owner through the fields a restaurant needs before it can
 * accept real orders: profile, hours, fulfillment/tax/tips, kitchen defaults,
 * and policies. Each "Next" persists that step's data immediately and advances
 * `restaurants.onboarding_step`, so closing the tab and coming back resumes at
 * the furthest step reached — `app/onboarding/setup/page.tsx` re-resolves that
 * pointer on every load. "Finish" sets the step to `done`, which is also what
 * `app/dashboard/layout.tsx` checks to stop redirecting here.
 */

import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Store,
  Clock,
  Truck,
  ChefHat,
  FileText,
  PartyPopper,
} from 'lucide-react';

import { getBrowserClient } from '@/lib/supabase/client';
import { restaurantService } from '@/lib/services';
import type { Restaurant, RestaurantSettings } from '@/lib/services/restaurant.service';
import { Spinner } from '@/components/Spinner';
import { ROUTES, RESTAURANT_TYPES, SETUP_STEPS } from '@/config/constants';
import type { SetupStep } from '@/config/constants';
import { SOUND_OPTIONS } from '@/lib/sound';
import type { Json } from '@/types/database.types';

function toJson<T>(value: T): Json {
  return value as unknown as Json;
}

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const STEP_META: Record<SetupStep, { label: string; icon: typeof Store }> = {
  profile: { label: 'Profile', icon: Store },
  hours: { label: 'Hours', icon: Clock },
  fulfillment: { label: 'Fulfillment & tax', icon: Truck },
  kitchen: { label: 'Kitchen', icon: ChefHat },
  policies: { label: 'Policies', icon: FileText },
  review: { label: 'Review', icon: PartyPopper },
};

interface FulfillmentConfig {
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  delivery_radius_km: number;
}
interface TipConfig {
  presets: number[];
  allow_custom: boolean;
}
interface KitchenConfig {
  default_prep_minutes: number;
}
interface PoliciesConfig {
  refund_policy: string;
  terms: string;
}

function asFulfillment(json: unknown): FulfillmentConfig {
  const v = (json ?? {}) as Partial<FulfillmentConfig>;
  return {
    pickup_enabled: v.pickup_enabled ?? true,
    delivery_enabled: v.delivery_enabled ?? true,
    delivery_radius_km: v.delivery_radius_km ?? 8,
  };
}
function asTip(json: unknown): TipConfig {
  const v = (json ?? {}) as Partial<TipConfig>;
  return { presets: v.presets ?? [10, 15, 20], allow_custom: v.allow_custom ?? true };
}
function asKitchen(json: unknown): KitchenConfig {
  const v = (json ?? {}) as Partial<KitchenConfig>;
  return { default_prep_minutes: v.default_prep_minutes ?? 15 };
}
function asPolicies(json: unknown): PoliciesConfig {
  const v = (json ?? {}) as Partial<PoliciesConfig>;
  return { refund_policy: v.refund_policy ?? '', terms: v.terms ?? '' };
}

type RestaurantPatch = Partial<
  Pick<
    Restaurant,
    | 'name'
    | 'restaurant_type'
    | 'address'
    | 'city'
    | 'region'
    | 'postal_code'
    | 'phone'
    | 'email'
    | 'hours'
    | 'holiday_hours'
    | 'tax_rate'
    | 'onboarding_step'
  >
>;
type SettingsPatch = Partial<
  Pick<
    RestaurantSettings,
    'fulfillment_config' | 'tip_config' | 'kitchen_config' | 'policies_config' | 'sound_config'
  >
>;

interface SetupWizardProps {
  restaurant: Restaurant;
  settings: RestaurantSettings | null;
}

export function SetupWizard({ restaurant, settings }: SetupWizardProps) {
  const router = useRouter();

  const initialIndex = Math.max(
    0,
    SETUP_STEPS.indexOf(restaurant.onboarding_step as SetupStep),
  );
  const [stepIndex, setStepIndex] = useState(initialIndex);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — profile
  const [name, setName] = useState(restaurant.name);
  const [restaurantType, setRestaurantType] = useState(restaurant.restaurant_type);
  const [address, setAddress] = useState(restaurant.address ?? '');
  const [city, setCity] = useState(restaurant.city ?? '');
  const [region, setRegion] = useState(restaurant.region ?? '');
  const [postalCode, setPostalCode] = useState(restaurant.postal_code ?? '');
  const [phone, setPhone] = useState(restaurant.phone ?? '');
  const [email, setEmail] = useState(restaurant.email ?? '');

  // Step 2 — hours
  const [hours, setHours] = useState<Record<string, string>>(
    (restaurant.hours as Record<string, string>) ?? {},
  );
  const [holidayHours, setHolidayHours] = useState<Record<string, string>>(
    (restaurant.holiday_hours as Record<string, string>) ?? {},
  );
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayLabel, setNewHolidayLabel] = useState('Closed');

  // Step 3 — fulfillment, tax, tips
  const [fulfillment, setFulfillment] = useState(asFulfillment(settings?.fulfillment_config));
  const [taxRate, setTaxRate] = useState(String(restaurant.tax_rate * 100));
  const [tip, setTip] = useState(asTip(settings?.tip_config));

  // Step 4 — kitchen
  const [kitchen, setKitchen] = useState(asKitchen(settings?.kitchen_config));
  const [soundId, setSoundId] = useState(
    ((settings?.sound_config as { sound_id?: string } | null)?.sound_id) ?? 'chime',
  );

  // Step 5 — policies
  const [policies, setPolicies] = useState(asPolicies(settings?.policies_config));

  const step = SETUP_STEPS[stepIndex];
  const isLast = stepIndex === SETUP_STEPS.length - 1;

  function addHoliday() {
    if (!newHolidayDate) return;
    setHolidayHours((prev) => ({ ...prev, [newHolidayDate]: newHolidayLabel || 'Closed' }));
    setNewHolidayDate('');
    setNewHolidayLabel('Closed');
  }
  function removeHoliday(date: string) {
    setHolidayHours((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  }

  async function persistAndAdvance() {
    setSaving(true);
    setError(null);
    const client = getBrowserClient();
    const nextStep = isLast ? 'done' : SETUP_STEPS[stepIndex + 1];

    let restaurantPatch: RestaurantPatch = { onboarding_step: nextStep };
    let settingsPatch: SettingsPatch | null = null;

    if (step === 'profile') {
      if (!name.trim()) {
        setError('Restaurant name is required.');
        setSaving(false);
        return;
      }
      restaurantPatch = {
        ...restaurantPatch,
        name: name.trim(),
        restaurant_type: restaurantType,
        address: address.trim() || null,
        city: city.trim() || null,
        region: region.trim() || null,
        postal_code: postalCode.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
      };
    } else if (step === 'hours') {
      restaurantPatch = { ...restaurantPatch, hours, holiday_hours: holidayHours };
    } else if (step === 'fulfillment') {
      if (!fulfillment.pickup_enabled && !fulfillment.delivery_enabled) {
        setError('Enable at least one of pickup or delivery.');
        setSaving(false);
        return;
      }
      const rate = Number(taxRate);
      if (Number.isNaN(rate) || rate < 0) {
        setError('Tax rate must be a non-negative number.');
        setSaving(false);
        return;
      }
      restaurantPatch = { ...restaurantPatch, tax_rate: rate / 100 };
      settingsPatch = {
        fulfillment_config: toJson(fulfillment),
        tip_config: toJson(tip),
      };
    } else if (step === 'kitchen') {
      settingsPatch = {
        kitchen_config: toJson(kitchen),
        sound_config: toJson({ sound_id: soundId, volume: 1, muted: false }),
      };
    } else if (step === 'policies') {
      settingsPatch = { policies_config: toJson(policies) };
    }

    const restaurantResult = await restaurantService.updateRestaurant(
      client,
      restaurant.id,
      restaurantPatch,
    );
    if (restaurantResult.error) {
      setError(restaurantResult.error.message);
      setSaving(false);
      return;
    }

    if (settingsPatch) {
      const settingsResult = await restaurantService.updateRestaurantSettings(
        client,
        restaurant.id,
        settingsPatch,
      );
      if (settingsResult.error) {
        setError(settingsResult.error.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    if (isLast) {
      router.push(`${ROUTES.dashboard}?restaurant=${restaurant.id}`);
      return;
    }
    setStepIndex((i) => i + 1);
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }

  return (
    <main className="wiz-shell">
      <div className="wiz-card">
        <div className="wiz-progress">
          {SETUP_STEPS.map((s, i) => {
            const meta = STEP_META[s];
            const Icon = meta.icon;
            const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending';
            return (
              <div className="wiz-progress-item" key={s} data-state={state}>
                <span className="wiz-progress-dot">
                  {state === 'done' ? <Check size={14} /> : <Icon size={14} />}
                </span>
                <span className="wiz-progress-label">{meta.label}</span>
              </div>
            );
          })}
        </div>

        <div className="wiz-body">
          {step === 'profile' && (
            <section>
              <h1 className="wiz-title">Tell us about {restaurant.name || 'your restaurant'}</h1>
              <p className="wiz-sub">This shows up on your storefront and receipts.</p>
              <div className="wiz-field">
                <label>Restaurant name</label>
                <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="wiz-field">
                <label>Restaurant type</label>
                <select
                  className="auth-input"
                  value={restaurantType}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setRestaurantType(e.target.value as typeof restaurantType)
                  }
                >
                  {RESTAURANT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="wiz-field">
                <label>Street address</label>
                <input className="auth-input" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="wiz-row3">
                <div className="wiz-field">
                  <label>City</label>
                  <input className="auth-input" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="wiz-field">
                  <label>State / region</label>
                  <input className="auth-input" value={region} onChange={(e) => setRegion(e.target.value)} />
                </div>
                <div className="wiz-field">
                  <label>Postal code</label>
                  <input
                    className="auth-input"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>
              </div>
              <div className="wiz-row2">
                <div className="wiz-field">
                  <label>Phone</label>
                  <input className="auth-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="wiz-field">
                  <label>Contact email</label>
                  <input className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
            </section>
          )}

          {step === 'hours' && (
            <section>
              <h1 className="wiz-title">When are you open?</h1>
              <p className="wiz-sub">
                Customers see these hours on your storefront. Leave a day blank if you&rsquo;re closed.
              </p>
              {DAYS.map((day) => (
                <div className="wiz-field" key={day}>
                  <label style={{ textTransform: 'capitalize' }}>{day}</label>
                  <input
                    className="auth-input"
                    value={hours[day] ?? ''}
                    placeholder="7:00 AM – 9:00 PM"
                    onChange={(e) => setHours((prev) => ({ ...prev, [day]: e.target.value }))}
                  />
                </div>
              ))}

              <h2 className="wiz-subtitle">Holiday hours</h2>
              <p className="wiz-sub">Add exceptions for specific dates — these override the weekly schedule.</p>
              {Object.entries(holidayHours).map(([date, label]) => (
                <div className="wiz-holiday-row" key={date}>
                  <span className="wiz-holiday-date">{date}</span>
                  <span className="wiz-holiday-label">{label}</span>
                  <button
                    type="button"
                    className="auth-btn"
                    data-variant="ghost"
                    onClick={() => removeHoliday(date)}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="wiz-holiday-add">
                <input
                  className="auth-input"
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                />
                <input
                  className="auth-input"
                  value={newHolidayLabel}
                  placeholder="Closed or 10am–2pm"
                  onChange={(e) => setNewHolidayLabel(e.target.value)}
                />
                <button type="button" className="auth-btn" data-variant="ghost" onClick={addHoliday}>
                  Add date
                </button>
              </div>
            </section>
          )}

          {step === 'fulfillment' && (
            <section>
              <h1 className="wiz-title">How do customers get their order?</h1>
              <div className="wiz-toggle-row">
                <label className="wiz-toggle">
                  <input
                    type="checkbox"
                    checked={fulfillment.pickup_enabled}
                    onChange={(e) =>
                      setFulfillment((f) => ({ ...f, pickup_enabled: e.target.checked }))
                    }
                  />
                  Pickup
                </label>
                <label className="wiz-toggle">
                  <input
                    type="checkbox"
                    checked={fulfillment.delivery_enabled}
                    onChange={(e) =>
                      setFulfillment((f) => ({ ...f, delivery_enabled: e.target.checked }))
                    }
                  />
                  Delivery
                </label>
              </div>
              {fulfillment.delivery_enabled && (
                <div className="wiz-field">
                  <label>Delivery radius (km)</label>
                  <input
                    className="auth-input"
                    type="number"
                    min="0"
                    step="0.5"
                    value={fulfillment.delivery_radius_km}
                    onChange={(e) =>
                      setFulfillment((f) => ({
                        ...f,
                        delivery_radius_km: Number(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              )}

              <h2 className="wiz-subtitle">Sales tax</h2>
              <div className="wiz-field">
                <label>Tax rate (%)</label>
                <input
                  className="auth-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>

              <h2 className="wiz-subtitle">Tips</h2>
              <div className="wiz-row3">
                {tip.presets.map((preset, i) => (
                  <div className="wiz-field" key={i}>
                    <label>Preset {i + 1} (%)</label>
                    <input
                      className="auth-input"
                      type="number"
                      min="0"
                      value={preset}
                      onChange={(e) =>
                        setTip((t) => ({
                          ...t,
                          presets: t.presets.map((p, idx) =>
                            idx === i ? Number(e.target.value) || 0 : p,
                          ),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              <label className="wiz-toggle">
                <input
                  type="checkbox"
                  checked={tip.allow_custom}
                  onChange={(e) => setTip((t) => ({ ...t, allow_custom: e.target.checked }))}
                />
                Allow customers to enter a custom tip
              </label>
            </section>
          )}

          {step === 'kitchen' && (
            <section>
              <h1 className="wiz-title">Kitchen defaults</h1>
              <div className="wiz-field">
                <label>Default prep time (minutes)</label>
                <input
                  className="auth-input"
                  type="number"
                  min="0"
                  value={kitchen.default_prep_minutes}
                  onChange={(e) =>
                    setKitchen({ default_prep_minutes: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="wiz-field">
                <label>Kitchen display alert sound</label>
                <select className="auth-input" value={soundId} onChange={(e) => setSoundId(e.target.value)}>
                  {SOUND_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} — {option.description}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          )}

          {step === 'policies' && (
            <section>
              <h1 className="wiz-title">Policies</h1>
              <p className="wiz-sub">Shown to customers at checkout and on your storefront. Optional — you can fill these in later.</p>
              <div className="wiz-field">
                <label>Refund policy</label>
                <textarea
                  className="auth-input wiz-textarea"
                  value={policies.refund_policy}
                  onChange={(e) => setPolicies((p) => ({ ...p, refund_policy: e.target.value }))}
                />
              </div>
              <div className="wiz-field">
                <label>Terms of service</label>
                <textarea
                  className="auth-input wiz-textarea"
                  value={policies.terms}
                  onChange={(e) => setPolicies((p) => ({ ...p, terms: e.target.value }))}
                />
              </div>
            </section>
          )}

          {step === 'review' && (
            <section>
              <h1 className="wiz-title">You&rsquo;re ready to go</h1>
              <p className="wiz-sub">
                {restaurant.name} is set up. You can fine-tune any of this later from Settings.
              </p>
              <ul className="wiz-review-list">
                <li>Type: {RESTAURANT_TYPES.find((t) => t.value === restaurantType)?.label}</li>
                <li>
                  Fulfillment:{' '}
                  {[
                    fulfillment.pickup_enabled && 'Pickup',
                    fulfillment.delivery_enabled && 'Delivery',
                  ]
                    .filter(Boolean)
                    .join(' & ') || 'None selected'}
                </li>
                <li>Tax rate: {taxRate}%</li>
                <li>Default prep time: {kitchen.default_prep_minutes} min</li>
              </ul>
            </section>
          )}

          {error && (
            <p role="alert" className="wiz-error">
              {error}
            </p>
          )}

          <div className="wiz-actions">
            {stepIndex > 0 && (
              <button
                type="button"
                className="auth-btn"
                data-variant="ghost"
                disabled={saving}
                onClick={goBack}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="auth-btn"
              disabled={saving}
              onClick={persistAndAdvance}
              style={{ marginLeft: 'auto' }}
            >
              {saving && <Spinner />}
              {saving ? 'Saving…' : isLast ? 'Finish setup' : 'Save & continue'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
