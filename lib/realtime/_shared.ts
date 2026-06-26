/**
 * Shared realtime building blocks.
 *
 * Thin, typed wrappers over Supabase Realtime postgres-changes subscriptions.
 * Each subscriber returns an `unsubscribe` function the caller invokes on
 * cleanup. RLS still governs which rows a client receives over the socket, so a
 * customer subscription only ever delivers that customer's rows, and a
 * kitchen-tier client never receives financial tables (which aren't published
 * at all).
 */

import type {
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

export type Client = SupabaseClient<Database>;

/** The kind of database change an event represents. */
export type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

/** A function that tears down a subscription. */
export type Unsubscribe = () => void;

/**
 * A normalized realtime change, narrowed to the row shape `T`. `newRow` is null
 * on DELETE; `oldRow` is null on INSERT.
 */
export interface RealtimeChange<T> {
  event: ChangeEvent;
  newRow: T | null;
  oldRow: T | null;
}

/**
 * Builds a channel name unique to a table + filter so multiple subscriptions in
 * one tab don't collide. Supabase requires channel names to be unique per use.
 */
export function channelName(parts: (string | number)[]): string {
  return parts.join(':');
}

/**
 * Subscribes to postgres changes on a table, optionally filtered, and routes
 * normalized changes to `onChange`. Returns an unsubscribe function.
 *
 * `filter` uses PostgREST filter syntax, e.g. `restaurant_id=eq.<uuid>`.
 */
export function subscribeToTable<T extends Record<string, unknown>>(
  client: Client,
  options: {
    name: string;
    table: string;
    filter?: string;
    event?: ChangeEvent | '*';
  },
  onChange: (change: RealtimeChange<T>) => void,
): Unsubscribe {
  const { name, table, filter, event = '*' } = options;

  const channel = client
    .channel(name)
    .on(
      // The string literal 'postgres_changes' is required by the SDK overload.
      'postgres_changes',
      {
        event,
        schema: 'public',
        table,
        ...(filter ? { filter } : {}),
      },
      (payload: RealtimePostgresChangesPayload<T>) => {
        const changeEvent = payload.eventType as ChangeEvent;
        const newRow =
          'new' in payload && payload.new && Object.keys(payload.new).length > 0
            ? (payload.new as T)
            : null;
        const oldRow =
          'old' in payload && payload.old && Object.keys(payload.old).length > 0
            ? (payload.old as T)
            : null;
        onChange({ event: changeEvent, newRow, oldRow });
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
