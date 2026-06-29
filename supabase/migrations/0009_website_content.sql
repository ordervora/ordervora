-- ============================================================================
-- OrderVora — Migration 0009
-- Module C: AI website builder.
-- ----------------------------------------------------------------------------
-- Adds one nullable JSON column to hold owner-facing storefront copy (hero
-- tagline + about section) that the new ai-website-builder Edge Function can
-- draft and the owner reviews/edits in Settings before saving. No new table
-- or RLS policy is needed — site_content is just another restaurants column,
-- already covered by the existing "restaurants owner update" policy from
-- migration 0001; it only needs to be added to the column whitelist in
-- restaurant.service.ts's updateRestaurant() alongside brand_colors/hours.
-- ============================================================================

alter table public.restaurants
  add column site_content jsonb;

-- ============================================================================
-- END Migration 0009
-- ============================================================================
