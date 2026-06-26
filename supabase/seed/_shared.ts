/**
 * Seed shared infrastructure.
 *
 * The seed runs against the SERVICE-ROLE client so it can write across every
 * table regardless of RLS — appropriate because seeding is a trusted, offline
 * operation. Everything it writes is scoped by `restaurant_id`, so the seed is
 * multi-tenant friendly: running it twice with a different slug produces a
 * second isolated tenant without touching the first.
 *
 * Environment required (same as the app/functions):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.types';

export type SeedClient = SupabaseClient<Database>;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing ${key}. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before seeding.`,
    );
  }
  return value;
}

/** Creates the service-role client used for all seed writes. */
export function createSeedClient(): SeedClient {
  return createClient<Database>(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Throws on a Supabase error, otherwise returns the data. Keeps seed steps terse. */
export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.data === null) {
    throw new Error('Expected data from a seed operation but received null.');
  }
  return result.data;
}

/** A console step logger so a seed run is readable. */
export function logStep(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`  • ${message}`);
}

/** Returns an ISO timestamp `minutesAgo` minutes before now. */
export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Returns an ISO timestamp `daysAgo` days before now. */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** The slug for the demo tenant. Override with SEED_SLUG for a second tenant. */
export const DEMO_SLUG = process.env.SEED_SLUG ?? 'demo-deli';
