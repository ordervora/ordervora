/**
 * Shared constants that mirror the database schema's enumerated types.
 *
 * These are the single client-side source of truth for the values defined in
 * `0001_initial_schema.sql`. They are kept in lockstep with the SQL enums; if
 * the schema changes, update both.
 */

// ----------------------------------------------------------------------------
// Staff roles (SQL: staff_role) + the global platform admin capability.
// ----------------------------------------------------------------------------
export const STAFF_ROLES = ['owner', 'manager', 'kitchen', 'delivery', 'cashier'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Platform admin is a global flag on `profiles`, not a per-restaurant role. */
export const PLATFORM_ADMIN = 'platform_admin' as const;

/** Every role the application reasons about, including the global one. */
export type AppRole = StaffRole | typeof PLATFORM_ADMIN | 'customer';

// ----------------------------------------------------------------------------
// Order lifecycle (SQL: order_state)
// ----------------------------------------------------------------------------
export const ORDER_STATES = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled',
  'refunded',
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

/** States a ticket occupies while live on the KDS board. */
export const KDS_ACTIVE_STATES = [
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
] as const satisfies readonly OrderState[];

/** Terminal states an order can no longer leave. */
export const TERMINAL_ORDER_STATES = [
  'completed',
  'cancelled',
  'refunded',
] as const satisfies readonly OrderState[];

// ----------------------------------------------------------------------------
// Fulfillment, payments, coupons, loyalty, reviews, notifications
// (SQL: fulfillment_type, payment_status, payment_provider, coupon_type,
//  loyalty_reason, review_source, notification_status, notification_channel)
// ----------------------------------------------------------------------------
export const FULFILLMENT_TYPES = ['pickup', 'delivery'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'authorized',
  'paid',
  'partially_refunded',
  'refunded',
  'failed',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ['stripe', 'cash', 'gift_card'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const COUPON_TYPES = ['percent', 'fixed', 'free_delivery', 'free_item'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const LOYALTY_REASONS = [
  'earned',
  'redeemed',
  'adjustment',
  'expired',
  'signup_bonus',
  'referral',
] as const;
export type LoyaltyReason = (typeof LOYALTY_REASONS)[number];

export const REVIEW_SOURCES = ['website', 'google', 'app'] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

export const NOTIFICATION_STATUSES = [
  'queued',
  'sent',
  'delivered',
  'viewed',
  'acknowledged',
  'escalated',
  'failed',
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['sound', 'push', 'sms', 'email', 'in_app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

// ----------------------------------------------------------------------------
// Route prefixes for the four surfaces (used by middleware).
// ----------------------------------------------------------------------------
export const ROUTES = {
  signIn: '/auth/sign-in',
  authCallback: '/auth/callback',
  dashboard: '/dashboard',
  kds: '/kds',
  admin: '/admin',
} as const;
