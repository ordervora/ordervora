-- ============================================================================
-- OrderVora — Migration 0003
-- Restaurant onboarding RPC.
-- ----------------------------------------------------------------------------
-- `restaurants` and `restaurant_staff` only grant INSERT to platform_admin —
-- by design, nothing in the app can create a tenant except this one audited
-- path. create_restaurant_with_owner() lets a signed-in user spin up their own
-- restaurant: it creates the restaurant, seats the caller as its first owner,
-- and gives it a default settings row, all in one transaction. SECURITY
-- DEFINER is what lets it cross the otherwise-closed RLS boundary; the
-- function itself is the gate (auth.uid() must be set, slug must be well
-- formed and free).
-- ============================================================================

create or replace function public.create_restaurant_with_owner(
  p_slug text,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_timezone text default 'America/New_York'
)
returns table (id uuid, slug citext)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id       uuid := auth.uid();
  v_slug          citext;
  v_restaurant_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to create a restaurant.';
  end if;

  v_slug := lower(trim(p_slug));
  if v_slug is null or v_slug = '' or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'URL slug must be lowercase letters, numbers, and hyphens only.';
  end if;
  if length(v_slug) < 3 or length(v_slug) > 60 then
    raise exception 'URL slug must be between 3 and 60 characters.';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'Restaurant name is required.';
  end if;

  begin
    insert into public.restaurants (slug, name, email, phone, timezone)
    values (v_slug, trim(p_name), nullif(trim(coalesce(p_email, '')), ''),
            nullif(trim(coalesce(p_phone, '')), ''),
            coalesce(p_timezone, 'America/New_York'))
    returning restaurants.id into v_restaurant_id;
  exception
    when unique_violation then
      raise exception 'That URL is already taken. Choose another.';
  end;

  insert into public.restaurant_staff (restaurant_id, user_id, role, status)
  values (v_restaurant_id, v_user_id, 'owner', 'active');

  insert into public.restaurant_settings (restaurant_id)
  values (v_restaurant_id)
  on conflict (restaurant_id) do nothing;

  return query select v_restaurant_id, v_slug;
end;
$$;

revoke all on function public.create_restaurant_with_owner(text, text, text, text, text) from public, anon;
grant execute on function public.create_restaurant_with_owner(text, text, text, text, text) to authenticated;

-- ============================================================================
-- END Migration 0003
-- ============================================================================
