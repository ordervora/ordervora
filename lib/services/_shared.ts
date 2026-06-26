/**
* Shared building blocks for the service layer.
*
* Services are framework-agnostic data-access modules that sit between the UI
* and Supabase. Each function takes an explicit Supabase client so the SAME
* service works from a Server Component (`getServerClient`), a Client Component
* (`getBrowserClient`), or privileged server code (`getServiceClient`) without
* the service deciding trust level for itself. The caller picks the client;
* Row Level Security does the enforcing.
*/

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

/**
* A Supabase client typed against our schema.
*
* Pinned to the fully-resolved three-argument form --
* `SupabaseClient<Database, 'public', Database['public']>` -- which is exactly
* what `createServerClient`, `createBrowserClient` (@supabase/ssr) and
* `createClient` (@supabase/supabase-js) return for this schema. Writing the
* resolved schema argument explicitly keeps the server, browser, and
* service-role clients mutually assignable to `Client` across @supabase/*
* versions, where the bare `SupabaseClient<Database>` form (which defaults the
* third argument to `GenericSchema`) is no longer assignable to the resolved
* form the factories produce.
*/
export type Client = SupabaseClient<Database, 'public', Database['public']>;

/**
* Uniform result wrapper. Services never throw for expected failures (a missing
* row, an RLS denial, a constraint violation); they return a typed result the
* caller can branch on. Unexpected programmer errors still throw.
*/
export type ServiceResult<T> =
 | { data: T; error: null }
 | { data: null; error: ServiceError };

export interface ServiceError {
 message: string;
 /** Postgres / PostgREST error code when available (e.g. '23505', 'PGRST116'). */
 code: string | null;
}

/** Wraps a successful value. */
export function ok<T>(data: T): ServiceResult<T> {
 return { data, error: null };
}

/** Wraps a failure with a human-readable message and optional code. */
export function fail<T>(message: string, code: string | null = null): ServiceResult<T> {
 return { data: null, error: { message, code } };
}

/**
* Normalizes a PostgREST error into a ServiceError. PostgREST returns code
* 'PGRST116' when `.single()` finds no row; callers usually treat that as
* "not found" rather than a hard error.
*/
export function toServiceError(error: {
 message: string;
 code?: string;
}): ServiceError {
 return { message: error.message, code: error.code ?? null };
}

/** True when a PostgREST error simply means "no row matched". */
export function isNotFound(error: { code?: string } | null): boolean {
 return error?.code === 'PGRST116';
}
