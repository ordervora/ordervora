-- Module A: Restaurant Setup Wizard support.
--
-- Adds the fields the wizard collects that don't yet have a home: restaurant
-- type (drives default theme suggestions later), holiday hours (separate from
-- the existing weekly `hours`), and a resumable step pointer. Settings gains
-- four new config blocks following the existing one-jsonb-per-concern pattern
-- already used by sound_config/printer_config/notification_config/etc. — no
-- new tables, no RLS changes needed since these are columns on already
-- tenant-isolated rows.

ALTER TABLE restaurants
  ADD COLUMN restaurant_type text NOT NULL DEFAULT 'other'
    CHECK (restaurant_type IN (
      'fast_food', 'cafe', 'fine_dining', 'pizza', 'coffee',
      'asian', 'bakery', 'bar', 'grocery', 'other'
    )),
  ADD COLUMN holiday_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN onboarding_step text NOT NULL DEFAULT 'profile';

ALTER TABLE restaurant_settings
  ADD COLUMN fulfillment_config jsonb NOT NULL DEFAULT
    '{"pickup_enabled": true, "delivery_enabled": true, "delivery_radius_km": 8}'::jsonb,
  ADD COLUMN tip_config jsonb NOT NULL DEFAULT
    '{"presets": [10, 15, 20], "allow_custom": true}'::jsonb,
  ADD COLUMN kitchen_config jsonb NOT NULL DEFAULT
    '{"default_prep_minutes": 15}'::jsonb,
  ADD COLUMN policies_config jsonb NOT NULL DEFAULT
    '{"refund_policy": "", "terms": ""}'::jsonb;
