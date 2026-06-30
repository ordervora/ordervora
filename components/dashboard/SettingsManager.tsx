'use client';

/**
 * SettingsManager — restaurant configuration.
 *
 * Edits the restaurant's branding (logo, colors), business hours, tax rate, and
 * the settings row's config blocks: delivery fee + escalation (notifications),
 * loyalty tiers, and KDS sound defaults. Stripe Connect status is shown with a
 * link to complete onboarding. Branding/tax write to the restaurants row; config
 * blocks write to restaurant_settings. All scoped by restaurant_id.
 */

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { getBrowserClient } from '@/lib/supabase/client';
import { useDashboard } from '@/lib/dashboard/context';
import { restaurantService } from '@/lib/services';
import { connectStripe, generateWebsiteContent } from '@/lib/dashboard/actions';
import { clientEnv } from '@/config/env';
import {
  SOUND_OPTIONS,
  DEFAULT_EVENT_SOUNDS,
  playSound,
  unlockAudio,
  type SoundId,
  type SoundEventType,
} from '@/lib/sound';
import { Spinner } from '@/components/Spinner';
import type { RestaurantSettings } from '@/lib/services/restaurant.service';

const EVENT_LABELS: Record<SoundEventType, string> = {
  new_order: 'New Order',
  priority_order: 'Priority Order',
  ready: 'Order Ready',
  cancelled: 'Cancelled',
  driver_assigned: 'Driver Assigned',
};

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export function SettingsManager() {
  const { restaurant, role } = useDashboard();

  const [name, setName] = useState(restaurant.name);
  const [logoUrl, setLogoUrl] = useState(restaurant.logo_url ?? '');
  const [taxRate, setTaxRate] = useState(String(restaurant.tax_rate * 100));
  const brand = (restaurant.brand_colors ?? {}) as Record<string, string>;
  const [brandColor, setBrandColor] = useState(brand.brand ?? '#C8842E');
  const [inkColor, setInkColor] = useState(brand.ink ?? '#1A1714');
  const [hours, setHours] = useState<Record<string, string>>(
    (restaurant.hours as Record<string, string>) ?? {},
  );

  const site = (restaurant.site_content ?? {}) as Partial<{
    tagline: string;
    about_heading: string;
    about_text: string;
  }>;
  const [tagline, setTagline] = useState(site.tagline ?? '');
  const [aboutHeading, setAboutHeading] = useState(site.about_heading ?? '');
  const [aboutText, setAboutText] = useState(site.about_text ?? '');
  const [generatingContent, setGeneratingContent] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [contentMessage, setContentMessage] = useState<string | null>(null);
  const [aiNotConfigured, setAiNotConfigured] = useState(false);

  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundVolume, setSoundVolume] = useState(80);
  const [eventSounds, setEventSounds] = useState<Record<SoundEventType, SoundId>>(
    { ...DEFAULT_EVENT_SOUNDS },
  );

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  useEffect(() => {
    const client = getBrowserClient();
    restaurantService
      .getRestaurantSettings(client, restaurant.id)
      .then((result) => {
        if (result.error || !result.data) return;
        setSettings(result.data);
        const notif = (result.data.notification_config ?? {}) as {
          delivery_fee?: number;
        };
        setDeliveryFee(String(notif.delivery_fee ?? 0));
        const sound = (result.data.sound_config ?? {}) as {
          enabled?: boolean;
          volume?: number;
          event_sounds?: Partial<Record<SoundEventType, SoundId>>;
        };
        setSoundEnabled(sound.enabled !== false);
        setSoundVolume(Math.round((sound.volume ?? 0.8) * 100));
        setEventSounds({ ...DEFAULT_EVENT_SOUNDS, ...sound.event_sounds });
      });
  }, [restaurant.id]);

  async function saveProfile() {
    setSavingProfile(true);
    setMessage(null);
    const client = getBrowserClient();
    const result = await restaurantService.updateRestaurant(
      client,
      restaurant.id,
      {
        name: name.trim(),
        logo_url: logoUrl.trim() || null,
        tax_rate: Number(taxRate) / 100,
        brand_colors: {
          ...brand,
          brand: brandColor,
          ink: inkColor,
        },
        hours,
      },
    );
    setSavingProfile(false);
    setMessage(result.error ? result.error.message : 'Profile saved.');
  }

  async function handleGenerateContent() {
    setGeneratingContent(true);
    setContentMessage(null);
    setAiNotConfigured(false);
    const result = await generateWebsiteContent(restaurant.id);
    setGeneratingContent(false);
    if (!result.ok || !result.content) {
      if (result.aiNotConfigured) setAiNotConfigured(true);
      setContentMessage(result.aiNotConfigured ? null : (result.error ?? 'Could not generate website content.'));
      return;
    }
    setTagline(result.content.tagline);
    setAboutHeading(result.content.about_heading);
    setAboutText(result.content.about_text);
    setContentMessage('Draft generated — review and save below.');
  }

  async function saveContent() {
    setSavingContent(true);
    setContentMessage(null);
    const client = getBrowserClient();
    const result = await restaurantService.updateRestaurant(
      client,
      restaurant.id,
      {
        site_content: {
          tagline: tagline.trim(),
          about_heading: aboutHeading.trim(),
          about_text: aboutText.trim(),
        },
      },
    );
    setSavingContent(false);
    setContentMessage(result.error ? result.error.message : 'Website content saved.');
  }

  async function saveConfig() {
    setSavingConfig(true);
    setMessage(null);
    const client = getBrowserClient();
    const notif = (settings?.notification_config ?? {}) as Record<
      string,
      unknown
    >;
    const result = await restaurantService.updateRestaurantSettings(
      client,
      restaurant.id,
      {
        notification_config: {
          ...notif,
          delivery_fee: Number(deliveryFee) || 0,
        },
        sound_config: {
          enabled: soundEnabled,
          volume: soundVolume / 100,
          event_sounds: eventSounds,
        },
      },
    );
    setSavingConfig(false);
    setMessage(result.error ? result.error.message : 'Settings saved.');
  }

  const stripeStarted = Boolean(restaurant.stripe_account_id);
  const stripeReady = restaurant.stripe_charges_enabled;

  async function handleConnectStripe() {
    setConnectingStripe(true);
    setStripeError(null);
    const path = `/dashboard/settings?restaurant=${restaurant.id}`;
    const result = await connectStripe(
      restaurant.id,
      `${clientEnv.siteUrl}${path}`,
      `${clientEnv.siteUrl}${path}`,
    );
    if (result.ok && result.url) {
      window.location.href = result.url;
      return;
    }
    setConnectingStripe(false);
    setStripeError(result.error ?? 'Could not start Stripe onboarding.');
  }

  return (
    <>
      <header className="dash-head">
        <div>
          <h1>Settings</h1>
          <div className="dash-head-sub">Branding, hours, payments &amp; more</div>
        </div>
      </header>

      <div className="dash-body">
        {message && (
          <div className="dash-success" style={{ marginBottom: 16 }}>
            {message}
          </div>
        )}

        <div className="dash-grid" data-cols="2">
          {/* Branding + profile */}
          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Branding &amp; profile</span>
            </div>
            <div className="dash-panel-body">
              <div className="dash-field">
                <label>Restaurant name</label>
                <input
                  className="dash-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="dash-field">
                <label>Logo URL</label>
                <input
                  className="dash-input"
                  value={logoUrl}
                  placeholder="https://…"
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
              </div>
              <div className="dash-row2">
                <div className="dash-field">
                  <label>Brand color</label>
                  <input
                    className="dash-input"
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                  />
                </div>
                <div className="dash-field">
                  <label>Ink color</label>
                  <input
                    className="dash-input"
                    type="color"
                    value={inkColor}
                    onChange={(e) => setInkColor(e.target.value)}
                  />
                </div>
              </div>
              <div className="dash-field">
                <label>Sales tax rate (%)</label>
                <input
                  className="dash-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                />
              </div>
              <button
                className="dash-btn"
                data-variant="primary"
                disabled={savingProfile}
                onClick={saveProfile}
              >
                {savingProfile && <Spinner />}
                {savingProfile ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </div>

          {/* Website content */}
          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Website content</span>
            </div>
            <div className="dash-panel-body">
              {aiNotConfigured && (
                <div
                  className="dash-error"
                  style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.55 }}
                >
                  <strong>AI features need setup:</strong> Add your{' '}
                  <code>ANTHROPIC_API_KEY</code> to Supabase Edge Function secrets
                  (Supabase Dashboard → Settings → Edge Functions → Secrets) to enable
                  AI Menu Import and AI Website Builder.
                </div>
              )}
              {contentMessage && (
                <p className="dash-kv-label" style={{ fontSize: 13, marginBottom: 8 }}>
                  {contentMessage}
                </p>
              )}
              <button
                className="dash-btn"
                disabled={generatingContent}
                onClick={handleGenerateContent}
                style={{ marginBottom: 12 }}
              >
                {generatingContent ? <Spinner /> : <Sparkles size={14} />}
                {generatingContent ? 'Generating…' : 'Generate with AI'}
              </button>
              <div className="dash-field">
                <label>Hero tagline</label>
                <input
                  className="dash-input"
                  value={tagline}
                  placeholder="A short line under your restaurant name"
                  onChange={(e) => setTagline(e.target.value)}
                />
              </div>
              <div className="dash-field">
                <label>About heading</label>
                <input
                  className="dash-input"
                  value={aboutHeading}
                  placeholder="Our story"
                  onChange={(e) => setAboutHeading(e.target.value)}
                />
              </div>
              <div className="dash-field">
                <label>About text</label>
                <textarea
                  className="dash-textarea"
                  value={aboutText}
                  placeholder="A couple of sentences introducing your restaurant to first-time customers."
                  onChange={(e) => setAboutText(e.target.value)}
                />
              </div>
              <button
                className="dash-btn"
                data-variant="primary"
                disabled={savingContent}
                onClick={saveContent}
              >
                {savingContent && <Spinner />}
                {savingContent ? 'Saving…' : 'Save website content'}
              </button>
            </div>
          </div>

          {/* Hours */}
          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">Business hours</span>
            </div>
            <div className="dash-panel-body">
              {DAYS.map((day) => (
                <div className="dash-field" key={day}>
                  <label style={{ textTransform: 'capitalize' }}>{day}</label>
                  <input
                    className="dash-input"
                    value={hours[day] ?? ''}
                    placeholder="7:00 AM – 9:00 PM"
                    onChange={(e) =>
                      setHours((prev) => ({ ...prev, [day]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Fulfillment + tips + loyalty */}
          <div className="dash-panel">
            <div className="dash-panel-head">
              <span className="dash-panel-title">
                Pickup, delivery &amp; loyalty
              </span>
            </div>
            <div className="dash-panel-body">
              <div className="dash-field">
                <label>Delivery fee ({restaurant.currency})</label>
                <input
                  className="dash-input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                />
              </div>
              <p
                className="dash-kv-label"
                style={{ fontSize: 13, lineHeight: 1.5 }}
              >
                Tips are collected at checkout as customer-selected presets.
                Loyalty tiers are configured per restaurant; customers earn one
                point per unit of subtotal by default.
              </p>
            </div>
          </div>

          {/* Sound + notifications */}
          <div className="dash-panel" style={{ gridColumn: '1 / -1' }}>
            <div className="dash-panel-head">
              <span className="dash-panel-title">
                Notifications &amp; alert sounds
              </span>
            </div>
            <div className="dash-panel-body">
              <div className="dash-row2" style={{ marginBottom: 16 }}>
                <div className="dash-field">
                  <label>Sounds</label>
                  <button
                    type="button"
                    className="dash-btn"
                    data-variant={soundEnabled ? 'primary' : undefined}
                    onClick={() => setSoundEnabled((v) => !v)}
                  >
                    {soundEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div className="dash-field">
                  <label>Volume — {soundVolume}%</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={soundVolume}
                    onChange={(e) => setSoundVolume(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--dash-accent, #2563eb)' }}
                  />
                </div>
              </div>

              <p className="dash-kv-label" style={{ fontSize: 13, marginBottom: 12 }}>
                Choose which sound plays for each event. Click Test to preview.
              </p>

              <div style={{ display: 'grid', gap: 10 }}>
                {(Object.keys(EVENT_LABELS) as SoundEventType[]).map((event) => (
                  <div key={event} className="dash-row2" style={{ alignItems: 'flex-end', gap: 8 }}>
                    <div className="dash-field" style={{ flex: 1, marginBottom: 0 }}>
                      <label>{EVENT_LABELS[event]}</label>
                      <select
                        className="dash-select"
                        value={eventSounds[event]}
                        onChange={(e) =>
                          setEventSounds((prev) => ({
                            ...prev,
                            [event]: e.target.value as SoundId,
                          }))
                        }
                      >
                        {SOUND_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label} — {option.description}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="dash-btn"
                      style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                      onClick={async () => {
                        await unlockAudio();
                        playSound(eventSounds[event], soundVolume / 100);
                      }}
                    >
                      Test
                    </button>
                  </div>
                ))}
              </div>

              <button
                className="dash-btn"
                data-variant="primary"
                disabled={savingConfig}
                onClick={saveConfig}
                style={{ marginTop: 16 }}
              >
                {savingConfig && <Spinner />}
                {savingConfig ? 'Saving…' : 'Save notification settings'}
              </button>
            </div>
          </div>

          {/* Stripe Connect */}
          <div className="dash-panel" style={{ gridColumn: '1 / -1' }}>
            <div className="dash-panel-head">
              <span className="dash-panel-title">Payments · Stripe Connect</span>
              <span
                className="dash-badge"
                data-tone={stripeReady ? 'ready' : stripeStarted ? 'active' : 'dead'}
              >
                {stripeReady
                  ? 'Connected'
                  : stripeStarted
                    ? 'Onboarding incomplete'
                    : 'Not connected'}
              </span>
            </div>
            <div className="dash-panel-body">
              {stripeReady ? (
                <p className="dash-kv-label" style={{ fontSize: 13 }}>
                  This restaurant is connected to Stripe and can accept payments.
                  Account: <code>{restaurant.stripe_account_id}</code>
                </p>
              ) : stripeStarted ? (
                <p className="dash-kv-label" style={{ fontSize: 13 }}>
                  Stripe onboarding was started but hasn&rsquo;t been finished —
                  checkout stays disabled until it is. Pick up where you left
                  off below.
                </p>
              ) : (
                <p className="dash-kv-label" style={{ fontSize: 13 }}>
                  Connect a Stripe account to start accepting online payments.
                  Onboarding is completed through Stripe; once finished,
                  checkout is enabled automatically.
                </p>
              )}

              {role === 'owner' ? (
                <>
                  <button
                    className="dash-btn"
                    data-variant="primary"
                    disabled={connectingStripe}
                    onClick={handleConnectStripe}
                    style={{ marginTop: 12 }}
                  >
                    {connectingStripe && <Spinner />}
                    {connectingStripe
                      ? 'Redirecting…'
                      : stripeStarted
                        ? 'Finish Stripe onboarding'
                        : 'Connect with Stripe'}
                  </button>
                  {stripeError && (
                    <p className="dash-error" style={{ marginTop: 8 }}>
                      {stripeError}
                    </p>
                  )}
                </>
              ) : (
                <p className="dash-kv-label" style={{ fontSize: 13, marginTop: 12 }}>
                  Only the restaurant owner can manage Stripe Connect.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
