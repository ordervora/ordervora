/**
 * Re-exports for the Supabase client factories.
 *
 * Note: `service.ts` is intentionally NOT re-exported here to discourage
 * accidental imports. Import it explicitly from `@/lib/supabase/service` in
 * server-only code when RLS bypass is genuinely required.
 */

export { getBrowserClient } from './client';
export { getServerClient } from './server';
export { updateSession, type MiddlewareSession } from './middleware';
