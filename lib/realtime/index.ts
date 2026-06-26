/** Public surface of the realtime layer. */

export {
  type Client,
  type Unsubscribe,
  type RealtimeChange,
  type ChangeEvent,
  subscribeToTable,
  channelName,
} from './_shared';

export {
  type OrderRow,
  type OrderEventRow,
  subscribeToRestaurantOrders,
  subscribeToRestaurantOrderEvents,
} from './orders';

export {
  type NotificationRow,
  subscribeToNotifications,
  subscribeToNewNotifications,
} from './notifications';

export {
  type TrackerHandlers,
  subscribeToOrderTracker,
} from './tracker';
