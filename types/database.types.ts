/**
 * Database types for OrderVora.
 *
 * Shape matches the output of `supabase gen types typescript`. Regenerate with:
 *
 *   supabase gen types typescript --project-id <id> --schema public \
 *     > types/database.types.ts
 *
 * It is the single source of truth for table/row shapes. Do not hand-edit rows
 * here once the CLI is wired up; regenerate after every migration. This file is
 * authored to exactly mirror `0001_initial_schema.sql` so Phase 0 is fully
 * typed before the CLI runs.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ----------------------------------------------------------------------------
// Enums (public schema)
// ----------------------------------------------------------------------------
export type StaffRoleEnum = 'owner' | 'manager' | 'kitchen' | 'delivery' | 'cashier';
export type FulfillmentTypeEnum = 'pickup' | 'delivery';
export type OrderStateEnum =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled'
  | 'refunded';
export type PaymentStatusEnum =
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'partially_refunded'
  | 'refunded'
  | 'failed';
export type PaymentProviderEnum = 'stripe' | 'cash' | 'gift_card';
export type CouponTypeEnum = 'percent' | 'fixed' | 'free_delivery' | 'free_item';
export type LoyaltyReasonEnum =
  | 'earned'
  | 'redeemed'
  | 'adjustment'
  | 'expired'
  | 'signup_bonus'
  | 'referral';
export type NotificationStatusEnum =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'viewed'
  | 'acknowledged'
  | 'escalated'
  | 'failed';
export type NotificationChannelEnum = 'sound' | 'push' | 'sms' | 'email' | 'in_app';
export type AddressLabelEnum = 'home' | 'work' | 'other';
export type ReviewSourceEnum = 'website' | 'google' | 'app';
export type EventActorEnum = 'customer' | 'staff' | 'system' | 'payment_webhook';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          phone: string | null;
          is_platform_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          is_platform_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          is_platform_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      restaurants: {
        Row: {
          id: string;
          slug: string;
          name: string;
          logo_url: string | null;
          brand_colors: Json;
          address: string | null;
          city: string | null;
          region: string | null;
          postal_code: string | null;
          country: string | null;
          phone: string | null;
          email: string | null;
          timezone: string;
          hours: Json;
          tax_rate: number;
          currency: string;
          stripe_account_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          logo_url?: string | null;
          brand_colors?: Json;
          address?: string | null;
          city?: string | null;
          region?: string | null;
          postal_code?: string | null;
          country?: string | null;
          phone?: string | null;
          email?: string | null;
          timezone?: string;
          hours?: Json;
          tax_rate?: number;
          currency?: string;
          stripe_account_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['restaurants']['Insert']>;
        Relationships: [];
      };
      restaurant_staff: {
        Row: {
          id: string;
          restaurant_id: string;
          user_id: string;
          role: StaffRoleEnum;
          display_name: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          user_id: string;
          role: StaffRoleEnum;
          display_name?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['restaurant_staff']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'restaurant_staff_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'restaurant_staff_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          restaurant_id: string;
          auth_user_id: string | null;
          name: string | null;
          email: string | null;
          phone: string | null;
          points: number;
          tier: string;
          lifetime_value: number;
          order_count: number;
          last_order_at: string | null;
          is_vip: boolean;
          marketing_opt_in: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          auth_user_id?: string | null;
          name?: string | null;
          email?: string | null;
          phone?: string | null;
          points?: number;
          tier?: string;
          lifetime_value?: number;
          order_count?: number;
          last_order_at?: string | null;
          is_vip?: boolean;
          marketing_opt_in?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['customers']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'customers_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
        ];
      };
      customer_addresses: {
        Row: {
          id: string;
          restaurant_id: string;
          customer_id: string;
          label: AddressLabelEnum;
          line1: string;
          line2: string | null;
          city: string | null;
          region: string | null;
          postal_code: string | null;
          notes: string | null;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          customer_id: string;
          label?: AddressLabelEnum;
          line1: string;
          line2?: string | null;
          city?: string | null;
          region?: string | null;
          postal_code?: string | null;
          notes?: string | null;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['customer_addresses']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'customer_addresses_customer_id_fkey';
            columns: ['customer_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          emoji: string | null;
          blurb: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          emoji?: string | null;
          blurb?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'categories_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
        ];
      };
      products: {
        Row: {
          id: string;
          restaurant_id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          price: number;
          tag: string | null;
          calories: number | null;
          protein: number | null;
          is_available: boolean;
          stock: number | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          category_id?: string | null;
          name: string;
          description?: string | null;
          price?: number;
          tag?: string | null;
          calories?: number | null;
          protein?: number | null;
          is_available?: boolean;
          stock?: number | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['products']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey';
            columns: ['category_id'];
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'products_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
        ];
      };
      product_costs: {
        Row: {
          product_id: string;
          restaurant_id: string;
          cost_price: number | null;
          supplier: string | null;
          updated_at: string;
        };
        Insert: {
          product_id: string;
          restaurant_id: string;
          cost_price?: number | null;
          supplier?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['product_costs']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'product_costs_product_id_fkey';
            columns: ['product_id'];
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      product_images: {
        Row: {
          id: string;
          restaurant_id: string;
          product_id: string;
          url: string;
          alt: string | null;
          is_primary: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          product_id: string;
          url: string;
          alt?: string | null;
          is_primary?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['product_images']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'product_images_product_id_fkey';
            columns: ['product_id'];
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
        ];
      };
      modifiers: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          subtitle: string | null;
          min_select: number;
          max_select: number | null;
          is_required: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          subtitle?: string | null;
          min_select?: number;
          max_select?: number | null;
          is_required?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['modifiers']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'modifiers_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
        ];
      };
      modifier_options: {
        Row: {
          id: string;
          restaurant_id: string;
          modifier_id: string;
          name: string;
          price_delta: number;
          is_available: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          modifier_id: string;
          name: string;
          price_delta?: number;
          is_available?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['modifier_options']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'modifier_options_modifier_id_fkey';
            columns: ['modifier_id'];
            referencedRelation: 'modifiers';
            referencedColumns: ['id'];
          },
        ];
      };
      product_modifiers: {
        Row: {
          id: string;
          restaurant_id: string;
          product_id: string;
          modifier_id: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          product_id: string;
          modifier_id: string;
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['product_modifiers']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'product_modifiers_product_id_fkey';
            columns: ['product_id'];
            referencedRelation: 'products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_modifiers_modifier_id_fkey';
            columns: ['modifier_id'];
            referencedRelation: 'modifiers';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: {
          id: string;
          restaurant_id: string;
          order_number: number | null;
          customer_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          fulfillment: FulfillmentTypeEnum;
          state: OrderStateEnum;
          channel: string;
          address: string | null;
          note: string | null;
          eta_minutes: number | null;
          is_vip: boolean;
          placed_at: string;
          accepted_at: string | null;
          started_at: string | null;
          ready_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          order_number?: number | null;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          fulfillment?: FulfillmentTypeEnum;
          state?: OrderStateEnum;
          channel?: string;
          address?: string | null;
          note?: string | null;
          eta_minutes?: number | null;
          is_vip?: boolean;
          placed_at?: string;
          accepted_at?: string | null;
          started_at?: string | null;
          ready_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['orders']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'orders_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'orders_customer_id_fkey';
            columns: ['customer_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      order_financials: {
        Row: {
          order_id: string;
          restaurant_id: string;
          subtotal: number;
          discount: number;
          tax: number;
          delivery_fee: number;
          tip: number;
          total: number;
          coupon_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          order_id: string;
          restaurant_id: string;
          subtotal?: number;
          discount?: number;
          tax?: number;
          delivery_fee?: number;
          tip?: number;
          total?: number;
          coupon_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['order_financials']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'order_financials_order_id_fkey';
            columns: ['order_id'];
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          restaurant_id: string;
          order_id: string;
          product_id: string | null;
          name_snapshot: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          order_id: string;
          product_id?: string | null;
          name_snapshot: string;
          quantity?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      order_item_financials: {
        Row: {
          order_item_id: string;
          restaurant_id: string;
          price_snapshot: number;
          line_total: number;
        };
        Insert: {
          order_item_id: string;
          restaurant_id: string;
          price_snapshot?: number;
          line_total?: number;
        };
        Update: Partial<Database['public']['Tables']['order_item_financials']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'order_item_financials_order_item_id_fkey';
            columns: ['order_item_id'];
            referencedRelation: 'order_items';
            referencedColumns: ['id'];
          },
        ];
      };
      order_item_modifiers: {
        Row: {
          id: string;
          restaurant_id: string;
          order_item_id: string;
          modifier_name_snapshot: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          order_item_id: string;
          modifier_name_snapshot: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['order_item_modifiers']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'order_item_modifiers_order_item_id_fkey';
            columns: ['order_item_id'];
            referencedRelation: 'order_items';
            referencedColumns: ['id'];
          },
        ];
      };
      order_item_modifier_financials: {
        Row: {
          order_item_modifier_id: string;
          restaurant_id: string;
          price_snapshot: number;
        };
        Insert: {
          order_item_modifier_id: string;
          restaurant_id: string;
          price_snapshot?: number;
        };
        Update: Partial<
          Database['public']['Tables']['order_item_modifier_financials']['Insert']
        >;
        Relationships: [
          {
            foreignKeyName: 'order_item_modifier_financials_order_item_modifier_id_fkey';
            columns: ['order_item_modifier_id'];
            referencedRelation: 'order_item_modifiers';
            referencedColumns: ['id'];
          },
        ];
      };
      order_events: {
        Row: {
          id: string;
          restaurant_id: string;
          order_id: string;
          from_state: OrderStateEnum | null;
          to_state: OrderStateEnum;
          actor_type: EventActorEnum;
          actor_id: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          order_id: string;
          from_state?: OrderStateEnum | null;
          to_state: OrderStateEnum;
          actor_type?: EventActorEnum;
          actor_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['order_events']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'order_events_order_id_fkey';
            columns: ['order_id'];
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          restaurant_id: string;
          order_id: string;
          provider: PaymentProviderEnum;
          status: PaymentStatusEnum;
          amount: number;
          amount_refunded: number;
          platform_fee: number;
          currency: string;
          stripe_payment_intent: string | null;
          stripe_charge_id: string | null;
          failure_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          order_id: string;
          provider?: PaymentProviderEnum;
          status?: PaymentStatusEnum;
          amount?: number;
          amount_refunded?: number;
          platform_fee?: number;
          currency?: string;
          stripe_payment_intent?: string | null;
          stripe_charge_id?: string | null;
          failure_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'payments_order_id_fkey';
            columns: ['order_id'];
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      coupons: {
        Row: {
          id: string;
          restaurant_id: string;
          code: string;
          type: CouponTypeEnum;
          value: number;
          min_subtotal: number;
          usage_limit: number | null;
          uses_count: number;
          per_customer_limit: number | null;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          code: string;
          type: CouponTypeEnum;
          value?: number;
          min_subtotal?: number;
          usage_limit?: number | null;
          uses_count?: number;
          per_customer_limit?: number | null;
          expires_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['coupons']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'coupons_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
        ];
      };
      coupon_redemptions: {
        Row: {
          id: string;
          restaurant_id: string;
          coupon_id: string;
          order_id: string;
          customer_id: string | null;
          amount_discounted: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          coupon_id: string;
          order_id: string;
          customer_id?: string | null;
          amount_discounted?: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['coupon_redemptions']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'coupon_redemptions_coupon_id_fkey';
            columns: ['coupon_id'];
            referencedRelation: 'coupons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'coupon_redemptions_order_id_fkey';
            columns: ['order_id'];
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          restaurant_id: string;
          customer_id: string | null;
          product_id: string | null;
          source: ReviewSourceEnum;
          rating: number;
          text: string | null;
          reply: string | null;
          replied: boolean;
          replied_by: string | null;
          replied_at: string | null;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          customer_id?: string | null;
          product_id?: string | null;
          source?: ReviewSourceEnum;
          rating: number;
          text?: string | null;
          reply?: string | null;
          replied?: boolean;
          replied_by?: string | null;
          replied_at?: string | null;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['reviews']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'reviews_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
        ];
      };
      loyalty_points: {
        Row: {
          id: string;
          restaurant_id: string;
          customer_id: string;
          order_id: string | null;
          points_delta: number;
          reason: LoyaltyReasonEnum;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          customer_id: string;
          order_id?: string | null;
          points_delta: number;
          reason: LoyaltyReasonEnum;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['loyalty_points']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'loyalty_points_customer_id_fkey';
            columns: ['customer_id'];
            referencedRelation: 'customers';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          restaurant_id: string;
          order_id: string | null;
          channel: NotificationChannelEnum;
          status: NotificationStatusEnum;
          sound_id: string | null;
          title: string | null;
          body: string | null;
          escalated: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          order_id?: string | null;
          channel?: NotificationChannelEnum;
          status?: NotificationStatusEnum;
          sound_id?: string | null;
          title?: string | null;
          body?: string | null;
          escalated?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'notifications_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
        ];
      };
      restaurant_settings: {
        Row: {
          restaurant_id: string;
          sound_config: Json;
          printer_config: Json;
          notification_config: Json;
          security_config: Json;
          loyalty_config: Json;
          updated_at: string;
        };
        Insert: {
          restaurant_id: string;
          sound_config?: Json;
          printer_config?: Json;
          notification_config?: Json;
          security_config?: Json;
          loyalty_config?: Json;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['restaurant_settings']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'restaurant_settings_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          restaurant_id: string;
          actor_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          actor_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'audit_logs_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
        ];
      };
      order_counters: {
        Row: {
          restaurant_id: string;
          last_number: number;
        };
        Insert: {
          restaurant_id: string;
          last_number?: number;
        };
        Update: Partial<Database['public']['Tables']['order_counters']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'order_counters_restaurant_id_fkey';
            columns: ['restaurant_id'];
            referencedRelation: 'restaurants';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      kds_tickets: {
        Row: {
          id: string | null;
          restaurant_id: string | null;
          order_number: number | null;
          state: OrderStateEnum | null;
          fulfillment: FulfillmentTypeEnum | null;
          note: string | null;
          is_vip: boolean | null;
          eta_minutes: number | null;
          placed_at: string | null;
          accepted_at: string | null;
          started_at: string | null;
          ready_at: string | null;
          completed_at: string | null;
          seconds_in_progress: number | null;
        };
        Relationships: [];
      };
      kds_ticket_items: {
        Row: {
          id: string | null;
          restaurant_id: string | null;
          order_id: string | null;
          name_snapshot: string | null;
          quantity: number | null;
        };
        Relationships: [];
      };
      kds_ticket_modifiers: {
        Row: {
          id: string | null;
          restaurant_id: string | null;
          order_item_id: string | null;
          modifier_name_snapshot: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_order_atomic: {
        Args: { payload: Json };
        Returns: { order_id: string; order_number: number }[];
      };
      create_restaurant_with_owner: {
        Args: {
          p_slug: string;
          p_name: string;
          p_email?: string | null;
          p_phone?: string | null;
          p_timezone?: string | null;
        };
        Returns: { id: string; slug: string }[];
      };
    };
    Enums: {
      staff_role: StaffRoleEnum;
      fulfillment_type: FulfillmentTypeEnum;
      order_state: OrderStateEnum;
      payment_status: PaymentStatusEnum;
      payment_provider: PaymentProviderEnum;
      coupon_type: CouponTypeEnum;
      loyalty_reason: LoyaltyReasonEnum;
      notification_status: NotificationStatusEnum;
      notification_channel: NotificationChannelEnum;
      address_label: AddressLabelEnum;
      review_source: ReviewSourceEnum;
      event_actor: EventActorEnum;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ----------------------------------------------------------------------------
// Convenience helpers for working with the generated types.
// ----------------------------------------------------------------------------
type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row'];

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];

export type Views<T extends keyof PublicSchema['Views']> =
  PublicSchema['Views'][T]['Row'];
