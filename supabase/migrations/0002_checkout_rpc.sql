-- ============================================================================
-- OrderVora — Migration 0002
-- Atomic order creation RPC + denormalized-counter reconciliation triggers.
-- ----------------------------------------------------------------------------
-- The checkout Edge Function computes authoritative pricing, then calls
-- create_order_atomic() to persist the order, its financials, items, item
-- financials, modifiers, and modifier financials in ONE transaction. A single
-- RPC guarantees atomicity that multiple client round-trips cannot.
--
-- Also adds triggers that keep cached counters honest:
--   * coupons.uses_count        <- count of coupon_redemptions
--   * customers.points          <- sum of loyalty_points ledger
-- ============================================================================


-- ----------------------------------------------------------------------------
-- create_order_atomic
-- ----------------------------------------------------------------------------
-- Accepts the fully-priced order as JSONB and writes every row in one tx.
-- SECURITY DEFINER: invoked by the checkout function via the service role; it
-- trusts its inputs because the pricing engine produced them server-side.
--
-- Payload shape (all money already computed by the pricing engine):
-- {
--   "restaurant_id": uuid,
--   "customer_id": uuid | null,
--   "customer_name": text | null,
--   "customer_phone": text | null,
--   "fulfillment": 'pickup'|'delivery',
--   "channel": text,
--   "address": text | null,
--   "note": text | null,
--   "is_vip": bool,
--   "eta_minutes": int | null,
--   "financials": { subtotal, discount, tax, delivery_fee, tip, total, coupon_code },
--   "items": [
--     { "product_id": uuid|null, "name": text, "unit_price": num, "quantity": int,
--       "line_total": num,
--       "modifiers": [ { "name": text, "price_delta": num } ] }
--   ]
-- }
--
-- Returns the new order id and order_number.
-- ----------------------------------------------------------------------------
create or replace function public.create_order_atomic(payload jsonb)
returns table (order_id uuid, order_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurant_id uuid := (payload->>'restaurant_id')::uuid;
  v_order_id      uuid;
  v_order_number  integer;
  v_item          jsonb;
  v_item_id       uuid;
  v_modifier      jsonb;
  v_modifier_id   uuid;
begin
  if v_restaurant_id is null then
    raise exception 'restaurant_id is required';
  end if;

  -- 1. order (order_number assigned by the existing before-insert trigger)
  insert into public.orders (
    restaurant_id, customer_id, customer_name, customer_phone,
    fulfillment, state, channel, address, note, is_vip, eta_minutes
  )
  values (
    v_restaurant_id,
    nullif(payload->>'customer_id', '')::uuid,
    payload->>'customer_name',
    payload->>'customer_phone',
    coalesce((payload->>'fulfillment')::fulfillment_type, 'pickup'),
    'pending',
    coalesce(payload->>'channel', 'web'),
    payload->>'address',
    payload->>'note',
    coalesce((payload->>'is_vip')::boolean, false),
    nullif(payload->>'eta_minutes', '')::integer
  )
  returning id, orders.order_number into v_order_id, v_order_number;

  -- 2. order_financials (1:1)
  insert into public.order_financials (
    order_id, restaurant_id, subtotal, discount, tax, delivery_fee, tip, total, coupon_code
  )
  values (
    v_order_id, v_restaurant_id,
    (payload->'financials'->>'subtotal')::numeric,
    (payload->'financials'->>'discount')::numeric,
    (payload->'financials'->>'tax')::numeric,
    (payload->'financials'->>'delivery_fee')::numeric,
    (payload->'financials'->>'tip')::numeric,
    (payload->'financials'->>'total')::numeric,
    nullif(payload->'financials'->>'coupon_code', '')
  );

  -- 3. items + item financials + modifiers + modifier financials
  for v_item in select * from jsonb_array_elements(payload->'items')
  loop
    insert into public.order_items (
      restaurant_id, order_id, product_id, name_snapshot, quantity
    )
    values (
      v_restaurant_id, v_order_id,
      nullif(v_item->>'product_id', '')::uuid,
      v_item->>'name',
      (v_item->>'quantity')::integer
    )
    returning id into v_item_id;

    insert into public.order_item_financials (
      order_item_id, restaurant_id, price_snapshot, line_total
    )
    values (
      v_item_id, v_restaurant_id,
      (v_item->>'unit_price')::numeric,
      (v_item->>'line_total')::numeric
    );

    if v_item ? 'modifiers' then
      for v_modifier in select * from jsonb_array_elements(v_item->'modifiers')
      loop
        insert into public.order_item_modifiers (
          restaurant_id, order_item_id, modifier_name_snapshot
        )
        values (
          v_restaurant_id, v_item_id, v_modifier->>'name'
        )
        returning id into v_modifier_id;

        insert into public.order_item_modifier_financials (
          order_item_modifier_id, restaurant_id, price_snapshot
        )
        values (
          v_modifier_id, v_restaurant_id,
          (v_modifier->>'price_delta')::numeric
        );
      end loop;
    end if;
  end loop;

  return query select v_order_id, v_order_number;
end;
$$;

revoke all on function public.create_order_atomic(jsonb) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- Reconcile coupons.uses_count from coupon_redemptions.
-- ----------------------------------------------------------------------------
create or replace function public.sync_coupon_uses()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.coupons set uses_count = uses_count + 1 where id = new.coupon_id;
  elsif tg_op = 'DELETE' then
    update public.coupons set uses_count = greatest(0, uses_count - 1) where id = old.coupon_id;
  end if;
  return null;
end;
$$;

create trigger trg_coupon_redemption_sync
  after insert or delete on public.coupon_redemptions
  for each row execute function public.sync_coupon_uses();


-- ----------------------------------------------------------------------------
-- Reconcile customers.points from the loyalty_points ledger.
-- ----------------------------------------------------------------------------
create or replace function public.sync_customer_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.customers
       set points = points + new.points_delta
     where id = new.customer_id;
  elsif tg_op = 'DELETE' then
    update public.customers
       set points = points - old.points_delta
     where id = old.customer_id;
  end if;
  return null;
end;
$$;

create trigger trg_loyalty_points_sync
  after insert or delete on public.loyalty_points
  for each row execute function public.sync_customer_points();

-- ============================================================================
-- END Migration 0002
-- ============================================================================
