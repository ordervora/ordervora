/**
 * Realtime: notifications.
 *
 * Subscribes to the notification stream for a restaurant — the feed that drives
 * the KDS sound/alert engine and dashboard badges. Notifications are
 * operational (no financial data), so kitchen-tier clients receive them. New
 * alerts arrive as INSERTs; escalations and status changes arrive as UPDATEs.
 */

import {
  type Client,
  type Unsubscribe,
  type RealtimeChange,
  subscribeToTable,
  channelName,
} from './_shared';
import type { Tables } from '@/types/database.types';

export type NotificationRow = Tables<'notifications'>;

/** Subscribes to all notification changes for a restaurant. */
export function subscribeToNotifications(
  client: Client,
  restaurantId: string,
  onChange: (change: RealtimeChange<NotificationRow>) => void,
): Unsubscribe {
  return subscribeToTable<NotificationRow>(
    client,
    {
      name: channelName(['notifications', restaurantId]),
      table: 'notifications',
      filter: `restaurant_id=eq.${restaurantId}`,
    },
    onChange,
  );
}

/**
 * Subscribes to only newly created notifications for a restaurant — the common
 * case for "play a sound when an alert arrives".
 */
export function subscribeToNewNotifications(
  client: Client,
  restaurantId: string,
  onInsert: (notification: NotificationRow) => void,
): Unsubscribe {
  return subscribeToTable<NotificationRow>(
    client,
    {
      name: channelName(['notifications:new', restaurantId]),
      table: 'notifications',
      filter: `restaurant_id=eq.${restaurantId}`,
      event: 'INSERT',
    },
    (change) => {
      if (change.newRow) onInsert(change.newRow);
    },
  );
}
