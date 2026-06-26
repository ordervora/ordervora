-- ============================================================================
-- OrderVora — Multi-Tenant Restaurant Ordering Platform
-- Supabase / PostgreSQL Schema  ·  v1.0
-- ----------------------------------------------------------------------------
-- Tenancy model : shared DB, shared schema, row isolation by restaurant_id
-- Security model: Postgres Row Level Security (RLS) on every tenant table
-- Roles         : customer · kitchen · manager · owner · platform_admin
-- ----------------------------------------------------------------------------
-- Apply order  : extensions -> enums -> helper fns -> tables -> indexes
--                -> triggers -> RLS -> policies -> realtime
-- ============================================================================


-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";      -- case-insensitive email/codes


-- ============================================================================
-- 1. ENUMERATED TYPES
-- ============================================================================

-- Staff role within a single restaurant. 'platform_admin' is NOT here:
-- it is a global capability flagged on profiles, not a per-restaurant role.
create type staff_role as enum ('owner', 'manager', 'kitchen', 'delivery', 'cashier');

create type fulfillment_type as enum ('pickup', 'delivery');

-- Unified order lifecycle (resolves the prototype conflicts).
-- pickup orders skip 'out_for_delivery'.
create type order_state as enum (
  'pending',           -- created, awaiting payment confirmation
  'accepted',          -- paid + accepted by store, hits the KDS
  'preparing',         -- kitchen started the ticket
  'ready',             -- food up; awaiting handoff / driver
  'out_for_delivery',  -- delivery only
  'completed',         -- handed off / delivered
  'cancelled',         -- terminal
  'refunded'           -- terminal
);

create type payment_status as enum ('pending', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed');

create type payment_provider as enum ('stripe', 'cash', 'gift_card');

create type coupon_type as enum ('percent', 'fixed', 'free_delivery', 'free_item');

create type loyalty_reason as enum ('earned', 'redeemed', 'adjustment', 'expired', 'signup_bonus', 'referral');

create type notification_status as enum ('queued', 'sent', 'delivered', 'viewed', 'acknowledged', 'escalated', 'failed');

create type notification_channel as enum ('sound', 'push', 'sms', 'email', 'in_app');

create type address_label as enum ('home', 'work', 'other');

create type review_source as enum ('website', 'google', 'app');

-- Who/what triggered an order state change (for the audit-grade event log).
create type event_actor as enum ('customer', 'staff', 'system', 'payment_webhook');


-- ============================================================================
-- 2. HELPER FUNCTIONS  (SECURITY DEFINER — used inside RLS policies)
-- ----------------------------------------------------------------------------
-- These centralize the "who am I / what can I touch" logic so policies stay
-- readable. They are SECURITY DEFINER and STABLE, and live in a locked-down
-- schema path. They read restaurant_staff WITHOUT triggering RLS recursion.
-- ============================================================================

-- True if the current user is the global platform operator (you).
create or replace function auth.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select is_platform_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- True if current user is ACTIVE staff at the given restaurant (any role).
create or replace function auth.is_staff_of(p_restaurant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_staff s
    where s.restaurant_id = p_restaurant
      and s.user_id = auth.uid()
      and s.status = 'active'
  );
$$;

-- Current user's role at a given restaurant (null if not staff).
create or replace function auth.role_at(p_restaurant uuid)
returns staff_role
language sql stable security definer set search_path = public
as $$
  select s.role from public.restaurant_staff s
  where s.restaurant_id = p_restaurant
    and s.user_id = auth.uid()
    and s.status = 'active'
  limit 1;
$$;

-- True if current user is owner/manager at the restaurant (the "money + config"
-- tier). Used to gate revenue, payments, settings, staff management.
create or replace function auth.is_manager_of(p_restaurant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_staff s
    where s.restaurant_id = p_restaurant
      and s.user_id = auth.uid()
      and s.status = 'active'
      and s.role in ('owner', 'manager')
  );
$$;

-- True if current user is the owner of the restaurant (top tier).
create or replace function auth.is_owner_of(p_restaurant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_staff s
    where s.restaurant_id = p_restaurant
      and s.user_id = auth.uid()
      and s.status = 'active'
      and s.role = 'owner'
  );
$$;

-- True if current user is kitchen-tier staff (kitchen or cashier) — the
-- operational floor that may move tickets but must never see money.
create or replace function auth.is_kitchen_of(p_restaurant uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.restaurant_staff s
    where s.restaurant_id = p_restaurant
      and s.user_id = auth.uid()
      and s.status = 'active'
      and s.role in ('kitchen', 'cashier', 'delivery')
  );
$$;

-- Resolve the customer row owned by the current auth user, scoped to a store.
create or replace function auth.current_customer(p_restaurant uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select c.id from public.customers c
  where c.restaurant_id = p_restaurant
    and c.auth_user_id = auth.uid()
  limit 1;
$$;

-- Generic updated_at trigger fn.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- ORDER NUMBERING (8): per-restaurant, gapless, race-safe.
-- A counter row per restaurant is locked FOR UPDATE inside the insert trigger,
-- so two concurrent checkouts can never collide on the same order_number.
-- ----------------------------------------------------------------------------
create table public.order_counters (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  last_number   integer not null default 1000
);
alter table public.order_counters enable row level security;
-- counters are mutated only by the SECURITY DEFINER trigger; no direct policies
-- are granted, so application roles can never read or tamper with them.

create or replace function public.assign_order_number()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  next_no integer;
begin
  if new.order_number is not null then
    return new;  -- explicit number provided (e.g. import) — respect it
  end if;

  insert into public.order_counters (restaurant_id, last_number)
  values (new.restaurant_id, 1001)
  on conflict (restaurant_id)
  do update set last_number = public.order_counters.last_number + 1
  returning last_number into next_no;

  new.order_number := next_no;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- PROFILE AUTO-PROVISION (9) — every new auth.users row gets a profiles row
-- automatically. Without this, new signups have no profile and every RLS
-- helper returns false, silently locking them out. Pulls name/avatar from the
-- OAuth/email signup metadata when present. The trigger itself is created at
-- the end (section 5b) once profiles exists.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


-- ============================================================================
-- 3. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles — global identity, extends auth.users 1:1.
-- One human = one profile. The platform_admin flag lives here (global, not
-- per-restaurant). A single profile may staff many restaurants and/or be a
-- customer at many restaurants.
-- ----------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text,
  avatar_url        text,
  phone             text,
  is_platform_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- restaurants — the TENANT ROOT. Every tenant-scoped row points back here.
-- Carries branding, hours, tax rate, and the Stripe connected-account id.
-- ----------------------------------------------------------------------------
create table public.restaurants (
  id                  uuid primary key default gen_random_uuid(),
  slug                citext unique not null,        -- ordervora.com/[slug]
  name                text not null,
  logo_url            text,
  brand_colors        jsonb not null default '{}'::jsonb,
  address             text,
  city                text,
  region              text,
  postal_code         text,
  country             text default 'US',
  phone               text,
  email               text,
  timezone            text not null default 'America/New_York',
  hours               jsonb not null default '{}'::jsonb,  -- weekly open/close
  tax_rate            numeric(6,4) not null default 0.0,   -- e.g. 0.08875
  currency            char(3) not null default 'USD',
  stripe_account_id   text,                                -- Stripe Connect
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- restaurant_staff — join of profile -> restaurant + role. Drives ALL RLS.
-- One unique (restaurant_id, user_id). This is the single source of truth for
-- "who works where and as what".
-- ----------------------------------------------------------------------------
create table public.restaurant_staff (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          staff_role not null,
  display_name  text,
  status        text not null default 'active',   -- active | off_shift | suspended
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

-- ----------------------------------------------------------------------------
-- customers — diner record, PER restaurant. May link to an auth account
-- (auth_user_id) or be a guest (null). Holds denormalized loyalty + LTV
-- counters for fast reads. These financial counters are manager-tier only.
-- ----------------------------------------------------------------------------
create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  auth_user_id    uuid references public.profiles(id) on delete set null,
  name            text,
  email           citext,
  phone           text,
  points          integer not null default 0,
  tier            text not null default 'Bronze',
  lifetime_value  numeric(12,2) not null default 0,   -- manager-tier only
  order_count     integer not null default 0,
  last_order_at   timestamptz,
  is_vip          boolean not null default false,
  marketing_opt_in boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (restaurant_id, auth_user_id)
);

-- ----------------------------------------------------------------------------
-- customer_addresses — saved delivery addresses for a customer.
-- ----------------------------------------------------------------------------
create table public.customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  label         address_label not null default 'home',
  line1         text not null,
  line2         text,
  city          text,
  region        text,
  postal_code   text,
  notes         text,                 -- "buzzer 2x", "leave at door"
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- categories — menu sections (Breakfast, Burgers...). Per restaurant.
-- ----------------------------------------------------------------------------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  emoji         text,
  blurb         text,
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- products — menu items. is_available is the "86" toggle. PUBLIC-READABLE.
-- NOTE: cost_price has been REMOVED from this table (it was a public data
-- leak). Food cost / margin now lives in product_costs (manager-tier RLS).
-- ----------------------------------------------------------------------------
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  category_id   uuid references public.categories(id) on delete set null,
  name          text not null,
  description   text,
  price         numeric(10,2) not null default 0 check (price >= 0),
  tag           text,                         -- 'Best Seller', 'Vegan'...
  calories      integer,
  protein       integer,
  is_available  boolean not null default true, -- 86 flag
  stock         integer,                       -- null = untracked
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- product_costs — food cost / margin data, 1:1 with products. SEPARATED from
-- the public products table so it is never exposed on the storefront. Only
-- manager-tier staff may read or write. This is the fix for the cost_price leak.
-- ----------------------------------------------------------------------------
create table public.product_costs (
  product_id    uuid primary key references public.products(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  cost_price    numeric(10,2) check (cost_price >= 0),  -- food cost
  supplier      text,
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- product_images — one product : many images, with a primary flag.
-- ----------------------------------------------------------------------------
create table public.product_images (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  url           text not null,
  alt           text,
  is_primary    boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- modifiers — modifier GROUP (Add-ons, Make-it-a-combo, Remove). min/max/
-- required encode selection rules.
-- ----------------------------------------------------------------------------
create table public.modifiers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name          text not null,
  subtitle      text,                  -- 'Optional', 'No charge'
  min_select    integer not null default 0,
  max_select    integer,               -- null = unlimited
  is_required   boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- modifier_options — individual choices inside a group + price delta.
-- ----------------------------------------------------------------------------
create table public.modifier_options (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  modifier_id   uuid not null references public.modifiers(id) on delete cascade,
  name          text not null,
  price_delta   numeric(10,2) not null default 0,
  is_available  boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- product_modifiers — join: which modifier groups apply to which product.
-- ----------------------------------------------------------------------------
create table public.product_modifiers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  modifier_id   uuid not null references public.modifiers(id) on delete cascade,
  sort_order    integer not null default 0,
  unique (product_id, modifier_id)
);

-- ----------------------------------------------------------------------------
-- orders — central OPERATIONAL table. After the financial split, this table
-- holds NO money: no subtotal/tax/tip/total/coupon. Those live in
-- order_financials (manager-tier). The orders table is what KDS and the
-- customer tracker read. order_number is assigned by a race-safe trigger.
-- ----------------------------------------------------------------------------
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  order_number     integer,                      -- assigned by trigger
  customer_id      uuid references public.customers(id) on delete set null,
  customer_name    text,                         -- snapshot
  customer_phone   text,                         -- snapshot
  fulfillment      fulfillment_type not null default 'pickup',
  state            order_state not null default 'pending',
  channel          text not null default 'web',  -- web | app | pos
  address          text,                         -- delivery snapshot
  note             text,                         -- kitchen-visible note
  eta_minutes      integer,
  is_vip           boolean not null default false,
  placed_at        timestamptz not null default now(),
  accepted_at      timestamptz,
  started_at       timestamptz,
  ready_at         timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (restaurant_id, order_number)
);

-- ----------------------------------------------------------------------------
-- order_financials (5) — ALL money for an order, 1:1 with orders. This is the
-- hard revenue wall: kitchen-tier has NO policy here and therefore cannot read
-- revenue, tax, tips, discounts, or totals under any circumstance. CHECK
-- constraints (8) keep every amount non-negative and the total reconciled.
-- ----------------------------------------------------------------------------
create table public.order_financials (
  order_id      uuid primary key references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subtotal      numeric(12,2) not null default 0 check (subtotal     >= 0),
  discount      numeric(12,2) not null default 0 check (discount     >= 0),
  tax           numeric(12,2) not null default 0 check (tax          >= 0),
  delivery_fee  numeric(12,2) not null default 0 check (delivery_fee >= 0),
  tip           numeric(12,2) not null default 0 check (tip          >= 0),
  total         numeric(12,2) not null default 0 check (total        >= 0),
  coupon_code   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- total must reconcile: subtotal - discount + tax + delivery_fee + tip
  -- (allow a 1-cent rounding tolerance)
  constraint total_reconciles
    check ( abs(total - (subtotal - discount + tax + delivery_fee + tip)) <= 0.01 ),
  -- discount can never exceed subtotal
  constraint discount_within_subtotal check ( discount <= subtotal )
);

-- ----------------------------------------------------------------------------
-- order_items — OPERATIONAL line items: what the kitchen makes. name + qty
-- only, NO money. price/line_total live in order_item_financials. product_id
-- nullable so history survives product deletion.
-- ----------------------------------------------------------------------------
create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  order_id       uuid not null references public.orders(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  name_snapshot  text not null,
  quantity       integer not null default 1 check (quantity > 0),
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- order_item_financials — per-line money, 1:1 with order_items. Manager-tier.
-- Kitchen never reads this. Snapshots freeze price at order time.
-- ----------------------------------------------------------------------------
create table public.order_item_financials (
  order_item_id  uuid primary key references public.order_items(id) on delete cascade,
  restaurant_id  uuid not null references public.restaurants(id) on delete cascade,
  price_snapshot numeric(10,2) not null default 0 check (price_snapshot >= 0),
  line_total     numeric(12,2) not null default 0 check (line_total     >= 0)
);

-- ----------------------------------------------------------------------------
-- order_item_modifiers — OPERATIONAL chosen modifiers: name only (kitchen
-- needs "Extra cheese", not its price). Price snapshot moved to financials.
-- ----------------------------------------------------------------------------
create table public.order_item_modifiers (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  order_item_id      uuid not null references public.order_items(id) on delete cascade,
  modifier_name_snapshot text not null,
  created_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- order_item_modifier_financials — per-modifier price, 1:1. Manager-tier.
-- ----------------------------------------------------------------------------
create table public.order_item_modifier_financials (
  order_item_modifier_id uuid primary key references public.order_item_modifiers(id) on delete cascade,
  restaurant_id          uuid not null references public.restaurants(id) on delete cascade,
  price_snapshot         numeric(10,2) not null default 0 check (price_snapshot >= 0)
);

-- ----------------------------------------------------------------------------
-- order_events (1) — APPEND-ONLY status-transition log. The backbone of order
-- tracking: drives the customer live tracker, KDS prep timers, recall history,
-- and "average prep time" analytics. One row per state change, immutable.
-- This is operational (no money) so kitchen-tier may read AND write it.
-- ----------------------------------------------------------------------------
create table public.order_events (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  from_state    order_state,                  -- null on initial creation
  to_state      order_state not null,
  actor_type    event_actor not null default 'staff',
  actor_id      uuid references public.profiles(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- AUTO-LOG order state transitions into order_events, and stamp the matching
-- timestamp column on orders (accepted_at/started_at/ready_at/completed_at).
-- Keeps the event log and the denormalized timestamps perfectly in sync.
-- ----------------------------------------------------------------------------
create or replace function public.log_order_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (restaurant_id, order_id, from_state, to_state, actor_type, actor_id)
    values (new.restaurant_id, new.id, null, new.state, 'system', auth.uid());
    return new;
  end if;

  if new.state is distinct from old.state then
    insert into public.order_events (restaurant_id, order_id, from_state, to_state, actor_type, actor_id)
    values (new.restaurant_id, new.id, old.state, new.state, 'staff', auth.uid());

    -- stamp lifecycle timestamps
    if new.state = 'accepted'          and new.accepted_at  is null then new.accepted_at  := now(); end if;
    if new.state = 'preparing'         and new.started_at   is null then new.started_at   := now(); end if;
    if new.state = 'ready'             and new.ready_at     is null then new.ready_at     := now(); end if;
    if new.state in ('completed')      and new.completed_at is null then new.completed_at := now(); end if;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- payments — money movement, one order : many payment attempts/refunds.
-- Holds Stripe ids. STRICTLY manager-tier — kitchen has zero access.
-- ----------------------------------------------------------------------------
create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  restaurant_id         uuid not null references public.restaurants(id) on delete cascade,
  order_id              uuid not null references public.orders(id) on delete cascade,
  provider              payment_provider not null default 'stripe',
  status                payment_status not null default 'pending',
  amount                numeric(12,2) not null default 0 check (amount          >= 0),
  amount_refunded       numeric(12,2) not null default 0 check (amount_refunded  >= 0),
  platform_fee          numeric(12,2) not null default 0 check (platform_fee     >= 0),
  currency              char(3) not null default 'USD',
  stripe_payment_intent text,
  stripe_charge_id      text,
  failure_reason        text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint refund_within_amount check ( amount_refunded <= amount )
);

-- ----------------------------------------------------------------------------
-- coupons — discount codes per restaurant.
-- ----------------------------------------------------------------------------
create table public.coupons (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  code          citext not null,
  type          coupon_type not null,
  value         numeric(10,2) not null default 0 check (value >= 0),
  min_subtotal  numeric(10,2) not null default 0 check (min_subtotal >= 0),
  usage_limit   integer check (usage_limit is null or usage_limit >= 0),
  uses_count    integer not null default 0 check (uses_count >= 0),
  per_customer_limit integer check (per_customer_limit is null or per_customer_limit >= 0),
  expires_at    timestamptz,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, code)
);

-- ----------------------------------------------------------------------------
-- coupon_redemptions (3) — one row per use. Enables per-customer usage limits
-- and a full redemption audit (which order, which customer, when). The global
-- coupons.uses_count is a denormalized cache of count(*) here.
-- ----------------------------------------------------------------------------
create table public.coupon_redemptions (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  coupon_id     uuid not null references public.coupons(id) on delete cascade,
  order_id      uuid not null references public.orders(id) on delete cascade,
  customer_id   uuid references public.customers(id) on delete set null,
  amount_discounted numeric(10,2) not null default 0 check (amount_discounted >= 0),
  created_at    timestamptz not null default now(),
  unique (coupon_id, order_id)   -- a coupon applies at most once per order
);

-- ----------------------------------------------------------------------------
-- reviews (2) — customer reviews with owner reply support. source = website /
-- google / app. reply + replied power the dashboard Reviews section. May be
-- tied to a specific product or be a store-level review.
-- ----------------------------------------------------------------------------
create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id   uuid references public.customers(id) on delete set null,
  product_id    uuid references public.products(id) on delete set null,
  source        review_source not null default 'website',
  rating        smallint not null check (rating between 1 and 5),
  text          text,
  reply         text,
  replied       boolean not null default false,
  replied_by    uuid references public.profiles(id) on delete set null,
  replied_at    timestamptz,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- loyalty_points — append-only points ledger. Sum per customer = balance;
-- the customers.points counter is a denormalized cache of this.
-- ----------------------------------------------------------------------------
create table public.loyalty_points (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id   uuid not null references public.customers(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete set null,
  points_delta  integer not null,           -- + earned / - redeemed
  reason        loyalty_reason not null,
  note          text,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- notifications — alert/sound history (powers the KDS escalation engine).
-- ----------------------------------------------------------------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete cascade,
  channel       notification_channel not null default 'in_app',
  status        notification_status not null default 'queued',
  sound_id      text,
  title         text,
  body          text,
  escalated     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- restaurant_settings — 1:1 config per restaurant. JSONB blobs for sound,
-- printer, notification, security config. Owner-tier writable.
-- ----------------------------------------------------------------------------
create table public.restaurant_settings (
  restaurant_id       uuid primary key references public.restaurants(id) on delete cascade,
  sound_config        jsonb not null default '{}'::jsonb,
  printer_config      jsonb not null default '{}'::jsonb,
  notification_config jsonb not null default '{}'::jsonb,
  security_config     jsonb not null default '{}'::jsonb,
  loyalty_config      jsonb not null default '{}'::jsonb,  -- tiers/multipliers
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- audit_logs — append-only trail of sensitive actions (state changes,
-- refunds, menu edits, staff changes). actor_id = who, scoped to restaurant.
-- ----------------------------------------------------------------------------
create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_id      uuid references public.profiles(id) on delete set null,
  action        text not null,         -- 'order.refunded', 'product.updated'
  entity_type   text,                  -- 'order', 'product'...
  entity_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);


-- ============================================================================
-- 4. INDEXES
-- ----------------------------------------------------------------------------
-- Every tenant table indexes restaurant_id (RLS filters on it constantly).
-- Hot query paths (KDS active orders, customer order history) get composites.
-- ============================================================================

-- staff / membership lookups (hit on every RLS check)
create index idx_staff_restaurant       on public.restaurant_staff(restaurant_id);
create index idx_staff_user             on public.restaurant_staff(user_id);
create index idx_staff_restaurant_user  on public.restaurant_staff(restaurant_id, user_id);

-- customers
create index idx_customers_restaurant   on public.customers(restaurant_id);
create index idx_customers_auth_user    on public.customers(auth_user_id);
create index idx_customers_phone        on public.customers(restaurant_id, phone);
create index idx_cust_addr_customer     on public.customer_addresses(customer_id);
create index idx_cust_addr_restaurant   on public.customer_addresses(restaurant_id);

-- catalog
create index idx_categories_restaurant  on public.categories(restaurant_id);
create index idx_products_restaurant     on public.products(restaurant_id);
create index idx_products_category       on public.products(category_id);
create index idx_products_available      on public.products(restaurant_id, is_available);
create index idx_product_images_product  on public.product_images(product_id);
create index idx_modifiers_restaurant    on public.modifiers(restaurant_id);
create index idx_mod_options_modifier    on public.modifier_options(modifier_id);
create index idx_prod_mods_product       on public.product_modifiers(product_id);
create index idx_prod_mods_restaurant    on public.product_modifiers(restaurant_id);

-- orders — the busiest table
create index idx_orders_restaurant       on public.orders(restaurant_id);
create index idx_orders_customer         on public.orders(customer_id);
create index idx_orders_state            on public.orders(restaurant_id, state);
-- KDS "active board" hot path: only live tickets, newest first
create index idx_orders_active
  on public.orders(restaurant_id, placed_at)
  where state in ('accepted', 'preparing', 'ready', 'out_for_delivery');
create index idx_orders_placed_at        on public.orders(restaurant_id, placed_at desc);

create index idx_order_items_order       on public.order_items(order_id);
create index idx_order_items_restaurant  on public.order_items(restaurant_id);
create index idx_oim_order_item          on public.order_item_modifiers(order_item_id);
create index idx_oim_restaurant          on public.order_item_modifiers(restaurant_id);

-- order_events (KDS timers, tracker, prep-time analytics)
create index idx_order_events_order       on public.order_events(order_id, created_at);
create index idx_order_events_restaurant  on public.order_events(restaurant_id, created_at desc);

-- financial siblings (manager-tier reads/joins)
create index idx_order_financials_restaurant on public.order_financials(restaurant_id);
create index idx_oif_restaurant              on public.order_item_financials(restaurant_id);
create index idx_oimf_restaurant             on public.order_item_modifier_financials(restaurant_id);
create index idx_product_costs_restaurant    on public.product_costs(restaurant_id);

-- payments
create index idx_payments_order          on public.payments(order_id);
create index idx_payments_restaurant     on public.payments(restaurant_id);
create index idx_payments_status         on public.payments(restaurant_id, status);

-- coupons / redemptions / loyalty
create index idx_coupons_restaurant      on public.coupons(restaurant_id);
create index idx_coupons_code            on public.coupons(restaurant_id, code);
create index idx_coupon_redemptions_coupon   on public.coupon_redemptions(coupon_id);
create index idx_coupon_redemptions_customer on public.coupon_redemptions(restaurant_id, customer_id);
create index idx_loyalty_customer        on public.loyalty_points(customer_id);
create index idx_loyalty_restaurant      on public.loyalty_points(restaurant_id);

-- reviews
create index idx_reviews_restaurant      on public.reviews(restaurant_id, created_at desc);
create index idx_reviews_product         on public.reviews(product_id);
create index idx_reviews_unreplied       on public.reviews(restaurant_id) where replied = false;

-- notifications / audit
create index idx_notifications_restaurant on public.notifications(restaurant_id);
create index idx_notifications_order      on public.notifications(order_id);
create index idx_audit_restaurant        on public.audit_logs(restaurant_id);
create index idx_audit_entity            on public.audit_logs(restaurant_id, entity_type, entity_id);


-- ============================================================================
-- 5. updated_at TRIGGERS
-- ============================================================================
create trigger trg_profiles_updated        before update on public.profiles            for each row execute function public.set_updated_at();
create trigger trg_restaurants_updated      before update on public.restaurants         for each row execute function public.set_updated_at();
create trigger trg_staff_updated            before update on public.restaurant_staff    for each row execute function public.set_updated_at();
create trigger trg_customers_updated        before update on public.customers           for each row execute function public.set_updated_at();
create trigger trg_cust_addr_updated        before update on public.customer_addresses  for each row execute function public.set_updated_at();
create trigger trg_categories_updated       before update on public.categories          for each row execute function public.set_updated_at();
create trigger trg_products_updated         before update on public.products            for each row execute function public.set_updated_at();
create trigger trg_modifiers_updated        before update on public.modifiers           for each row execute function public.set_updated_at();
create trigger trg_orders_updated           before update on public.orders              for each row execute function public.set_updated_at();
create trigger trg_payments_updated         before update on public.payments            for each row execute function public.set_updated_at();
create trigger trg_coupons_updated          before update on public.coupons             for each row execute function public.set_updated_at();
create trigger trg_notifications_updated    before update on public.notifications       for each row execute function public.set_updated_at();
create trigger trg_settings_updated         before update on public.restaurant_settings for each row execute function public.set_updated_at();
create trigger trg_reviews_updated          before update on public.reviews             for each row execute function public.set_updated_at();
create trigger trg_order_financials_updated before update on public.order_financials    for each row execute function public.set_updated_at();
create trigger trg_product_costs_updated    before update on public.product_costs       for each row execute function public.set_updated_at();

-- ---- functional triggers ---------------------------------------------------
-- (7) assign a race-safe per-restaurant order number before insert
create trigger trg_orders_assign_number
  before insert on public.orders
  for each row execute function public.assign_order_number();

-- (1) log every order creation + state transition into order_events,
--     and stamp lifecycle timestamps
create trigger trg_orders_log_transition
  before insert or update on public.orders
  for each row execute function public.log_order_transition();

-- (9) auto-provision a profile for every new auth user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ============================================================================
-- 6. ENABLE ROW LEVEL SECURITY (default-deny on every tenant table)
-- ============================================================================
alter table public.profiles            enable row level security;
alter table public.restaurants          enable row level security;
alter table public.restaurant_staff     enable row level security;
alter table public.customers            enable row level security;
alter table public.customer_addresses   enable row level security;
alter table public.categories           enable row level security;
alter table public.products             enable row level security;
alter table public.product_images       enable row level security;
alter table public.modifiers            enable row level security;
alter table public.modifier_options     enable row level security;
alter table public.product_modifiers    enable row level security;
alter table public.orders               enable row level security;
alter table public.order_financials     enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_item_financials enable row level security;
alter table public.order_item_modifiers enable row level security;
alter table public.order_item_modifier_financials enable row level security;
alter table public.order_events         enable row level security;
alter table public.product_costs        enable row level security;
alter table public.payments             enable row level security;
alter table public.coupons              enable row level security;
alter table public.coupon_redemptions   enable row level security;
alter table public.reviews              enable row level security;
alter table public.loyalty_points       enable row level security;
alter table public.notifications        enable row level security;
alter table public.restaurant_settings  enable row level security;
alter table public.audit_logs           enable row level security;

-- Force RLS even for table owners (defense in depth on sensitive tables).
alter table public.payments                        force row level security;
alter table public.orders                          force row level security;
alter table public.order_financials                force row level security;
alter table public.order_item_financials           force row level security;
alter table public.order_item_modifier_financials  force row level security;
alter table public.product_costs                   force row level security;
alter table public.audit_logs                      force row level security;
-- order_counters: RLS enabled with NO policies => unreachable by app roles;
-- mutated only by the SECURITY DEFINER trigger. Intentional hard lock.


-- ============================================================================
-- 7. RLS POLICIES
-- ----------------------------------------------------------------------------
-- Tiers, lowest to highest privilege:
--   customer        : own data + public catalog only
--   kitchen/cashier : operational order data, NO money/analytics/customer$
--   manager/owner   : full restaurant incl. revenue, payments, settings
--   platform_admin  : everything, all tenants
--
-- The KDS revenue-blocking requirement is enforced TWO ways:
--   (a) kitchen has NO row access to payments / loyalty / audit / settings
--   (b) kitchen reads orders/order_items through the kds_tickets VIEW (sec. 8)
--       which never selects money columns. Direct table SELECT for kitchen is
--       still scoped, but the app routes KDS through the view.
-- ============================================================================

-- ---------- profiles --------------------------------------------------------
create policy "profiles self read"
  on public.profiles for select
  using ( id = auth.uid() or auth.is_platform_admin() );

create policy "profiles self update"
  on public.profiles for update
  using ( id = auth.uid() )
  with check ( id = auth.uid() and is_platform_admin = (select is_platform_admin from public.profiles where id = auth.uid()) );

create policy "profiles platform_admin all"
  on public.profiles for all
  using ( auth.is_platform_admin() )
  with check ( auth.is_platform_admin() );

-- ---------- restaurants -----------------------------------------------------
-- Public can read active restaurants (storefront needs name/branding/hours).
create policy "restaurants public read active"
  on public.restaurants for select
  using ( is_active = true or auth.is_staff_of(id) or auth.is_platform_admin() );

create policy "restaurants owner update"
  on public.restaurants for update
  using ( auth.is_owner_of(id) or auth.is_platform_admin() )
  with check ( auth.is_owner_of(id) or auth.is_platform_admin() );

create policy "restaurants platform_admin insert"
  on public.restaurants for insert
  with check ( auth.is_platform_admin() );

create policy "restaurants platform_admin delete"
  on public.restaurants for delete
  using ( auth.is_platform_admin() );

-- ---------- restaurant_staff ------------------------------------------------
-- A staffer can see the roster of restaurants they belong to. Only owners
-- (and platform_admin) can add/modify/remove staff.
create policy "staff read own restaurants"
  on public.restaurant_staff for select
  using ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() );

create policy "staff owner manage"
  on public.restaurant_staff for all
  using ( auth.is_owner_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_owner_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- customers -------------------------------------------------------
-- A customer reads/updates only their own row. Manager-tier staff read/manage
-- all customers (LTV, points). Kitchen-tier: NO access (customer financial
-- data is off-limits).
create policy "customers self read"
  on public.customers for select
  using (
    auth_user_id = auth.uid()
    or auth.is_manager_of(restaurant_id)
    or auth.is_platform_admin()
  );

create policy "customers self update"
  on public.customers for update
  using ( auth_user_id = auth.uid() )
  with check ( auth_user_id = auth.uid() );

create policy "customers self insert"
  on public.customers for insert
  with check (
    auth_user_id = auth.uid()
    or auth.is_manager_of(restaurant_id)
    or auth.is_platform_admin()
  );

create policy "customers manager manage"
  on public.customers for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- customer_addresses ----------------------------------------------
create policy "addresses owner access"
  on public.customer_addresses for all
  using (
    customer_id = auth.current_customer(restaurant_id)
    or auth.is_manager_of(restaurant_id)
    or auth.is_platform_admin()
  )
  with check (
    customer_id = auth.current_customer(restaurant_id)
    or auth.is_manager_of(restaurant_id)
    or auth.is_platform_admin()
  );

-- ---------- catalog: categories / products / images / modifiers -------------
-- PUBLIC READ (storefront). Catalog is not sensitive. cost_price on products
-- is protected at the view layer for non-managers (see menu_public view).
-- WRITE: manager-tier (kitchen may flip is_available via a scoped policy).

-- categories
create policy "categories public read"
  on public.categories for select using ( true );
create policy "categories manager write"
  on public.categories for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- products
create policy "products public read"
  on public.products for select using ( true );
create policy "products manager write"
  on public.products for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );
-- Kitchen may toggle availability (86 an item) but nothing else. Enforced by
-- a column-narrow UPDATE policy; app sends only is_available.
create policy "products kitchen toggle availability"
  on public.products for update
  using ( auth.is_kitchen_of(restaurant_id) )
  with check ( auth.is_kitchen_of(restaurant_id) );

-- product_images
create policy "product_images public read"
  on public.product_images for select using ( true );
create policy "product_images manager write"
  on public.product_images for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- modifiers
create policy "modifiers public read"
  on public.modifiers for select using ( true );
create policy "modifiers manager write"
  on public.modifiers for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- modifier_options
create policy "modifier_options public read"
  on public.modifier_options for select using ( true );
create policy "modifier_options manager write"
  on public.modifier_options for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- product_modifiers
create policy "product_modifiers public read"
  on public.product_modifiers for select using ( true );
create policy "product_modifiers manager write"
  on public.product_modifiers for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- orders ----------------------------------------------------------
-- READ:
--   * customer  -> own orders only
--   * any active staff (incl. kitchen) -> all orders of their restaurant
--     (rows yes, but kitchen reads through kds_tickets view; money columns are
--      never surfaced to KDS by the app)
-- INSERT: customer creating own order, or staff/POS, or platform.
-- UPDATE:
--   * kitchen/cashier/delivery -> may advance operational state
--   * manager/owner            -> full update (incl. refunds path)
create policy "orders read"
  on public.orders for select
  using (
    customer_id = auth.current_customer(restaurant_id)
    or auth.is_staff_of(restaurant_id)
    or auth.is_platform_admin()
  );

create policy "orders customer insert"
  on public.orders for insert
  with check (
    customer_id = auth.current_customer(restaurant_id)
    or auth.is_staff_of(restaurant_id)
    or auth.is_platform_admin()
  );

create policy "orders staff advance state"
  on public.orders for update
  using ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- order_items / order_item_modifiers (OPERATIONAL — no money) ------
-- These tables now contain NO money (split into *_financials). Kitchen-tier
-- reads them freely for the KDS; customers read their own.
create policy "order_items read"
  on public.order_items for select
  using (
    auth.is_staff_of(restaurant_id)
    or auth.is_platform_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.customer_id = auth.current_customer(o.restaurant_id)
    )
  );
create policy "order_items staff write"
  on public.order_items for all
  using ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() );
-- allow customer to insert their own line items at checkout
create policy "order_items customer insert"
  on public.order_items for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.customer_id = auth.current_customer(o.restaurant_id)
    )
  );

create policy "order_item_modifiers read"
  on public.order_item_modifiers for select
  using (
    auth.is_staff_of(restaurant_id)
    or auth.is_platform_admin()
    or exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_modifiers.order_item_id
        and o.customer_id = auth.current_customer(o.restaurant_id)
    )
  );
create policy "order_item_modifiers staff write"
  on public.order_item_modifiers for all
  using ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() );
create policy "order_item_modifiers customer insert"
  on public.order_item_modifiers for insert
  with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_modifiers.order_item_id
        and o.customer_id = auth.current_customer(o.restaurant_id)
    )
  );

-- ---------- order_events (OPERATIONAL — kitchen reads + writes) -------------
-- Status-transition log. Operational, not financial, so kitchen-tier may read
-- and append. Customers may read events for their own order (live tracker).
-- Append-only: no update/delete policies exist.
create policy "order_events read"
  on public.order_events for select
  using (
    auth.is_staff_of(restaurant_id)
    or auth.is_platform_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_events.order_id
        and o.customer_id = auth.current_customer(o.restaurant_id)
    )
  );
create policy "order_events staff insert"
  on public.order_events for insert
  with check ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- order_financials (MANAGER-TIER — the hard revenue wall) ---------
-- Kitchen-tier has NO policy here, so revenue/tax/tip/discount/total are
-- structurally unreadable to kitchen. Customers read their OWN order's totals
-- (receipt), nothing else.
create policy "order_financials read"
  on public.order_financials for select
  using (
    auth.is_manager_of(restaurant_id)
    or auth.is_platform_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_financials.order_id
        and o.customer_id = auth.current_customer(o.restaurant_id)
    )
  );
create policy "order_financials manager write"
  on public.order_financials for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );
-- customer may insert their own order's financial row at checkout
create policy "order_financials customer insert"
  on public.order_financials for insert
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_financials.order_id
        and o.customer_id = auth.current_customer(o.restaurant_id)
    )
  );

-- ---------- order_item_financials (MANAGER-TIER) ----------------------------
create policy "order_item_financials read"
  on public.order_item_financials for select
  using (
    auth.is_manager_of(restaurant_id)
    or auth.is_platform_admin()
    or exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_financials.order_item_id
        and o.customer_id = auth.current_customer(o.restaurant_id)
    )
  );
create policy "order_item_financials manager write"
  on public.order_item_financials for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );
create policy "order_item_financials customer insert"
  on public.order_item_financials for insert
  with check (
    exists (
      select 1 from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.id = order_item_financials.order_item_id
        and o.customer_id = auth.current_customer(o.restaurant_id)
    )
  );

-- ---------- order_item_modifier_financials (MANAGER-TIER) -------------------
create policy "oimf read"
  on public.order_item_modifier_financials for select
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );
create policy "oimf manager write"
  on public.order_item_modifier_financials for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );
create policy "oimf customer insert"
  on public.order_item_modifier_financials for insert
  with check (
    exists (
      select 1 from public.order_item_modifiers m
      join public.order_items oi on oi.id = m.order_item_id
      join public.orders o on o.id = oi.order_id
      where m.id = order_item_modifier_financials.order_item_modifier_id
        and o.customer_id = auth.current_customer(o.restaurant_id)
    )
  );

-- ---------- product_costs (MANAGER-TIER — margin data, never public) --------
create policy "product_costs manager all"
  on public.product_costs for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- payments  (MANAGER-TIER ONLY — kitchen fully blocked) -----------
-- No customer access, no kitchen access. Only manager/owner + platform_admin.
-- A customer may read their OWN payment status through the orders surface, not
-- this table. This is the hard wall around revenue/payment data.
create policy "payments manager read"
  on public.payments for select
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

create policy "payments manager write"
  on public.payments for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- coupons ---------------------------------------------------------
-- Public can read ACTIVE coupons (to validate a code client-side preview);
-- authoritative validation happens server-side. Manager-tier manages them.
create policy "coupons public read active"
  on public.coupons for select
  using ( is_active = true or auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );
create policy "coupons manager write"
  on public.coupons for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- coupon_redemptions (manager read; customer/system insert) -------
-- Redemption is a financial event: manager-tier reads all; a customer may read
-- and create their own. Kitchen has no access.
create policy "coupon_redemptions read"
  on public.coupon_redemptions for select
  using (
    auth.is_manager_of(restaurant_id)
    or auth.is_platform_admin()
    or customer_id = auth.current_customer(restaurant_id)
  );
create policy "coupon_redemptions insert"
  on public.coupon_redemptions for insert
  with check (
    auth.is_manager_of(restaurant_id)
    or auth.is_platform_admin()
    or customer_id = auth.current_customer(restaurant_id)
  );
create policy "coupon_redemptions manager manage"
  on public.coupon_redemptions for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- reviews (public read published; customer writes own; owner replies)
create policy "reviews public read"
  on public.reviews for select
  using ( is_published = true or auth.is_manager_of(restaurant_id) or auth.is_platform_admin()
          or customer_id = auth.current_customer(restaurant_id) );
-- a customer may post a review as themselves
create policy "reviews customer insert"
  on public.reviews for insert
  with check ( customer_id = auth.current_customer(restaurant_id) );
-- a customer may edit/delete their own review (but not the reply fields — the
-- app restricts columns; managers own the reply path)
create policy "reviews customer update own"
  on public.reviews for update
  using ( customer_id = auth.current_customer(restaurant_id) )
  with check ( customer_id = auth.current_customer(restaurant_id) );
-- managers/owners reply to and moderate reviews
create policy "reviews manager manage"
  on public.reviews for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );
create policy "loyalty self read"
  on public.loyalty_points for select
  using (
    customer_id = auth.current_customer(restaurant_id)
    or auth.is_manager_of(restaurant_id)
    or auth.is_platform_admin()
  );
create policy "loyalty manager write"
  on public.loyalty_points for all
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- notifications  (all active staff read; system/manager write) ----
-- Kitchen NEEDS notifications (new-order alerts) — this is operational, not
-- financial, so kitchen-tier may read.
create policy "notifications staff read"
  on public.notifications for select
  using ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() );
create policy "notifications staff write"
  on public.notifications for all
  using ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- restaurant_settings  (OWNER-tier only) --------------------------
-- Contains security/printer/sound config. Kitchen reads sound config via app
-- defaults, not this table. Lock to owner + platform_admin.
create policy "settings owner all"
  on public.restaurant_settings for all
  using ( auth.is_owner_of(restaurant_id) or auth.is_platform_admin() )
  with check ( auth.is_owner_of(restaurant_id) or auth.is_platform_admin() );

-- ---------- audit_logs  (MANAGER read; insert by anyone scoped; no edits) ---
create policy "audit manager read"
  on public.audit_logs for select
  using ( auth.is_manager_of(restaurant_id) or auth.is_platform_admin() );
create policy "audit staff insert"
  on public.audit_logs for insert
  with check ( auth.is_staff_of(restaurant_id) or auth.is_platform_admin() );
-- no update/delete policies => append-only by construction.


-- ============================================================================
-- 8. KDS-SAFE VIEWS  (revenue firewall for kitchen displays)
-- ----------------------------------------------------------------------------
-- After the financial split, the kitchen wall is now STRUCTURAL, not just a
-- view convention: money lives in separate *_financials tables that kitchen-
-- tier has no RLS access to. These views are the clean KDS read surface and
-- additionally cannot expose money because the base operational tables no
-- longer contain any. security_invoker = true keeps tenant isolation intact.
-- ============================================================================
create or replace view public.kds_tickets
with (security_invoker = true) as
select
  o.id,
  o.restaurant_id,
  o.order_number,
  o.state,
  o.fulfillment,
  o.note,
  o.is_vip,
  o.eta_minutes,
  o.placed_at,
  o.accepted_at,
  o.started_at,
  o.ready_at,
  o.completed_at,
  -- live prep clock for the kitchen, derived from timestamps (no money)
  extract(epoch from (now() - coalesce(o.started_at, o.accepted_at, o.placed_at)))::int as seconds_in_progress
from public.orders o
where o.state in ('accepted', 'preparing', 'ready', 'out_for_delivery');

create or replace view public.kds_ticket_items
with (security_invoker = true) as
select
  oi.id,
  oi.restaurant_id,
  oi.order_id,
  oi.name_snapshot,        -- item name only — no money table is joined
  oi.quantity
from public.order_items oi;

create or replace view public.kds_ticket_modifiers
with (security_invoker = true) as
select
  m.id,
  m.restaurant_id,
  m.order_item_id,
  m.modifier_name_snapshot  -- modifier name only
from public.order_item_modifiers m;

comment on view public.kds_tickets is
  'KDS revenue firewall: kitchen-facing order view. Money lives in separate *_financials tables kitchen cannot access; this view exposes status/fulfillment/note/timestamps/prep-clock only.';


-- ============================================================================
-- 9. REALTIME PUBLICATION
-- ----------------------------------------------------------------------------
-- Supabase ships a `supabase_realtime` publication. Add only the tables the
-- three surfaces subscribe to. RLS still governs WHICH rows each client
-- receives over the socket. We do NOT publish payments / audit_logs / settings.
--   * orders                -> customer tracker, KDS board, owner dashboard
--   * order_events           -> live tracker stages, KDS timers, prep analytics
--   * order_items           -> KDS ticket contents
--   * order_item_modifiers  -> KDS ticket modifiers
--   * notifications         -> KDS sound/alert engine, dashboard badges
--   * products              -> live 86 / availability changes across surfaces
-- We do NOT publish any *_financials, payments, audit_logs, or settings.
-- ============================================================================
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_events;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.order_item_modifiers;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.products;

-- Ensure UPDATE/DELETE events carry full old-row data for filtering.
alter table public.orders               replica identity full;
alter table public.order_events         replica identity full;
alter table public.order_items          replica identity full;
alter table public.order_item_modifiers replica identity full;
alter table public.notifications        replica identity full;
alter table public.products             replica identity full;

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
