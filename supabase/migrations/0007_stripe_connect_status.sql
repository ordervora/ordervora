-- Module E: Stripe Connect self-service onboarding.
--
-- restaurants.stripe_account_id (added in 0001) only records that a Connect
-- account exists, not whether it can actually accept charges — Express
-- accounts sit in "pending verification" until the owner finishes Stripe's
-- hosted onboarding (identity, bank details, etc.). These two flags are
-- reconciled from the `account.updated` webhook so the dashboard and the
-- checkout gate can tell "connected" apart from "can actually take money."
-- Defaulting both to false is correct for every existing row: no restaurant
-- has a stripe_account_id set yet, so none of them are actually onboarded.
ALTER TABLE restaurants
  ADD COLUMN stripe_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN stripe_details_submitted boolean NOT NULL DEFAULT false;
