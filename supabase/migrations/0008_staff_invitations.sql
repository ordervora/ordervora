-- ============================================================================
-- OrderVora — Migration 0008
-- Module F: Staff invitation system.
-- ----------------------------------------------------------------------------
-- restaurant_staff.user_id is NOT NULL (references profiles), so it cannot
-- hold a pending invite — there is no profile until the invitee signs up.
-- staff_invitations is the holding table: an owner inserts a row (RLS:
-- owner-tier only, mirrors "staff owner manage" from migration 0001) with an
-- email + role; the token is server-generated so it never has to be trusted
-- from the client. The send-email Edge Function delivers the accept link, and
-- accept_staff_invitation() — modeled on create_restaurant_with_owner() from
-- migration 0003 — is the one audited SECURITY DEFINER path that lets the
-- signed-in invitee redeem that token into a real restaurant_staff row.
-- ============================================================================

create table public.staff_invitations (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  email         citext not null,
  role          staff_role not null,
  token         text not null unique default encode(gen_random_bytes(32), 'hex'),
  status        text not null default 'pending',  -- pending | accepted | revoked | expired
  invited_by    uuid references public.profiles(id) on delete set null,
  accepted_by   uuid references public.profiles(id) on delete set null,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_staff_invitations_restaurant on public.staff_invitations(restaurant_id);
create index idx_staff_invitations_email       on public.staff_invitations(restaurant_id, email);

-- At most one OUTSTANDING invitation per (restaurant, email) — re-inviting
-- after expiry/revocation/acceptance is fine, stacking pending invites is not.
create unique index idx_staff_invitations_pending_unique
  on public.staff_invitations(restaurant_id, email)
  where (status = 'pending');

create trigger trg_staff_invitations_updated
  before update on public.staff_invitations
  for each row execute function public.set_updated_at();

alter table public.staff_invitations enable row level security;

-- Staff can see the invitations outstanding at their restaurant; only the
-- owner (and platform_admin) can create/revoke them — same shape as the
-- "staff read own restaurants" / "staff owner manage" pair on restaurant_staff.
create policy "invitations read own restaurants"
  on public.staff_invitations for select
  using ( public.is_staff_of(restaurant_id) or public.is_platform_admin() );

create policy "invitations owner manage"
  on public.staff_invitations for all
  using ( public.is_owner_of(restaurant_id) or public.is_platform_admin() )
  with check ( public.is_owner_of(restaurant_id) or public.is_platform_admin() );

-- ----------------------------------------------------------------------------
-- accept_staff_invitation — redeems a pending invitation token for the
-- signed-in caller. Validates the token, status, expiry, and that the
-- invitee's own auth email matches who the invite was sent to, then seats
-- the caller in restaurant_staff with the invited role and marks the
-- invitation accepted. SECURITY DEFINER because restaurant_staff only grants
-- owner-tier writes under RLS; this function is the gate.
-- ----------------------------------------------------------------------------
create or replace function public.accept_staff_invitation(p_token text)
returns table (restaurant_id uuid, role staff_role)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_user_email text;
  v_invitation record;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to accept this invitation.';
  end if;

  select * into v_invitation
  from public.staff_invitations
  where token = p_token
  for update;

  if v_invitation is null then
    raise exception 'This invitation link is invalid.';
  end if;

  -- Re-visiting the accept link after already redeeming it (page refresh,
  -- back button) should succeed quietly rather than error, as long as it was
  -- this same caller who redeemed it.
  if v_invitation.status = 'accepted' and v_invitation.accepted_by = v_user_id then
    return query select v_invitation.restaurant_id, v_invitation.role;
    return;
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'This invitation has already been used or revoked.';
  end if;

  if v_invitation.expires_at < now() then
    update public.staff_invitations set status = 'expired' where id = v_invitation.id;
    raise exception 'This invitation has expired.';
  end if;

  select u.email into v_user_email from auth.users u where u.id = v_user_id;
  if v_user_email is null or lower(v_user_email) <> lower(v_invitation.email::text) then
    raise exception 'This invitation was sent to a different email address.';
  end if;

  insert into public.restaurant_staff (restaurant_id, user_id, role, status)
  values (v_invitation.restaurant_id, v_user_id, v_invitation.role, 'active')
  on conflict (restaurant_id, user_id) do update
    set role = excluded.role, status = 'active';

  update public.staff_invitations
    set status = 'accepted', accepted_by = v_user_id, accepted_at = now()
    where id = v_invitation.id;

  return query select v_invitation.restaurant_id, v_invitation.role;
end;
$$;

revoke all on function public.accept_staff_invitation(text) from public, anon;
grant execute on function public.accept_staff_invitation(text) to authenticated;

-- ============================================================================
-- END Migration 0008
-- ============================================================================
