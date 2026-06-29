-- Security hardening: tighten RLS/grants flagged by the Supabase security
-- advisor. Backfilled from the remote migration applied directly via the
-- dashboard (20260628182157_security_hardening_counters_and_functions) so the
-- repo matches the live database.

-- 1. order_counters: RLS enabled but no policy existed. The counter is
-- managed only by the assign_order_number() SECURITY DEFINER trigger; add an
-- explicit staff-read policy so owners/managers can view their counter.
DROP POLICY IF EXISTS order_counters_staff_read ON order_counters;
CREATE POLICY order_counters_staff_read ON order_counters
  FOR SELECT TO authenticated
  USING (is_staff_of(restaurant_id));

-- 2. Pin search_path on the trigger function flagged as mutable.
ALTER FUNCTION public.set_updated_at() SET search_path = public, pg_temp;

-- 3. Trigger-only functions must NOT be callable as REST RPCs by anon/authenticated.
-- These run inside triggers (definer context) and should never be invoked directly.
REVOKE EXECUTE ON FUNCTION public.assign_order_number() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_transition() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_coupon_uses() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_customer_points() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;

-- 4. Internal RLS-helper functions: keep callable by authenticated (RLS policies use them),
-- but revoke from anon since anonymous users never need to probe role membership directly.
REVOKE EXECUTE ON FUNCTION public.is_owner_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_kitchen_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_staff_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.role_at(uuid) FROM anon;
