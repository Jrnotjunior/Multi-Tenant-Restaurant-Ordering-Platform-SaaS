export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      branch_memberships: {
        Row: {
          branch_id: string
          created_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_memberships_matching_branch"
            columns: ["tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "branch_memberships_matching_user"
            columns: ["tenant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "tenant_memberships"
            referencedColumns: ["tenant_id", "user_id"]
          },
        ]
      }
      branch_menu_items: {
        Row: {
          branch_id: string
          is_available: boolean
          item_id: string
          price_override_centavos: number | null
          tenant_id: string
        }
        Insert: {
          branch_id: string
          is_available?: boolean
          item_id: string
          price_override_centavos?: number | null
          tenant_id: string
        }
        Update: {
          branch_id?: string
          is_available?: boolean
          item_id?: string
          price_override_centavos?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_menu_items_branch_fk"
            columns: ["tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "branch_menu_items_item_fk"
            columns: ["tenant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      branches: {
        Row: {
          accepting_orders: boolean
          contact_phone: string | null
          created_at: string
          delivery_location_latitude: number | null
          delivery_location_longitude: number | null
          delivery_pricing: Json
          id: string
          is_active: boolean
          name: string
          pickup_address: string | null
          slug: string
          store_address: string | null
          tenant_id: string
          timezone: string
        }
        Insert: {
          accepting_orders?: boolean
          contact_phone?: string | null
          created_at?: string
          delivery_location_latitude?: number | null
          delivery_location_longitude?: number | null
          delivery_pricing?: Json
          id?: string
          is_active?: boolean
          name: string
          pickup_address?: string | null
          slug: string
          store_address?: string | null
          tenant_id: string
          timezone?: string
        }
        Update: {
          accepting_orders?: boolean
          contact_phone?: string | null
          created_at?: string
          delivery_location_latitude?: number | null
          delivery_location_longitude?: number | null
          delivery_pricing?: Json
          id?: string
          is_active?: boolean
          name?: string
          pickup_address?: string | null
          slug?: string
          store_address?: string | null
          tenant_id?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_loyalty_accounts: {
        Row: {
          lifetime_points_earned: number
          lifetime_points_redeemed: number
          points_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          lifetime_points_earned?: number
          lifetime_points_redeemed?: number
          points_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          lifetime_points_earned?: number
          lifetime_points_redeemed?: number
          points_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_loyalty_transactions: {
        Row: {
          created_at: string
          description: string
          id: string
          order_id: string | null
          points_change: number
          transaction_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          order_id?: string | null
          points_change: number
          transaction_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          order_id?: string | null
          points_change?: number
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_order_audit_events: {
        Row: {
          actor_source: string
          actor_user_id: string | null
          event_type: string
          id: number
          new_values: Json
          occurred_at: string
          old_values: Json
          order_id: string
          tenant_id: string
        }
        Insert: {
          actor_source: string
          actor_user_id?: string | null
          event_type: string
          id?: never
          new_values?: Json
          occurred_at?: string
          old_values?: Json
          order_id: string
          tenant_id: string
        }
        Update: {
          actor_source?: string
          actor_user_id?: string | null
          event_type?: string
          id?: never
          new_values?: Json
          occurred_at?: string
          old_values?: Json
          order_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_audit_events_order_fk"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customer_order_items: {
        Row: {
          created_at: string
          id: string
          item_name_snapshot: string
          line_number: number
          line_total_centavos: number
          menu_item_id: string
          options_snapshot: Json
          order_id: string
          quantity: number
          special_instructions: string
          tenant_id: string
          unit_price_centavos: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_name_snapshot: string
          line_number: number
          line_total_centavos: number
          menu_item_id: string
          options_snapshot?: Json
          order_id: string
          quantity: number
          special_instructions?: string
          tenant_id: string
          unit_price_centavos: number
        }
        Update: {
          created_at?: string
          id?: string
          item_name_snapshot?: string
          line_number?: number
          line_total_centavos?: number
          menu_item_id?: string
          options_snapshot?: Json
          order_id?: string
          quantity?: number
          special_instructions?: string
          tenant_id?: string
          unit_price_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_items_tenant_order_fk"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customer_order_payment_sessions: {
        Row: {
          amount_centavos: number
          checkout_session_id: string | null
          checkout_url: string | null
          created_at: string
          environment: string
          id: string
          order_id: string
          paid_at: string | null
          paymongo_account_id: string
          paymongo_payment_id: string | null
          refund_attempt_key: string | null
          refund_attempt_started_at: string | null
          refund_id: string | null
          refund_reason: string | null
          refunded_amount_centavos: number | null
          refunded_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_centavos: number
          checkout_session_id?: string | null
          checkout_url?: string | null
          created_at?: string
          environment: string
          id?: string
          order_id: string
          paid_at?: string | null
          paymongo_account_id: string
          paymongo_payment_id?: string | null
          refund_attempt_key?: string | null
          refund_attempt_started_at?: string | null
          refund_id?: string | null
          refund_reason?: string | null
          refunded_amount_centavos?: number | null
          refunded_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_centavos?: number
          checkout_session_id?: string | null
          checkout_url?: string | null
          created_at?: string
          environment?: string
          id?: string
          order_id?: string
          paid_at?: string | null
          paymongo_account_id?: string
          paymongo_payment_id?: string | null
          refund_attempt_key?: string | null
          refund_attempt_started_at?: string | null
          refund_id?: string | null
          refund_reason?: string | null
          refunded_amount_centavos?: number | null
          refunded_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_payment_sessions_order_fk"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      customer_orders: {
        Row: {
          branch_id: string
          created_at: string
          currency: string
          customer_name: string
          customer_phone: string
          customer_phone_normalized: string
          customer_user_id: string | null
          delivery_address: string | null
          delivery_fee_centavos: number | null
          delivery_latitude: number | null
          delivery_longitude: number | null
          delivery_notes: string
          id: string
          idempotency_key: string
          loyalty_discount_centavos: number
          loyalty_points_redeemed: number
          loyalty_processed_at: string | null
          order_number: number
          order_status: string
          order_type: string
          payment_collected_at: string | null
          payment_collected_by: string | null
          payment_method: string
          payment_status: string
          request_fingerprint: string
          subtotal_centavos: number
          tenant_id: string
          total_centavos: number | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          currency?: string
          customer_name: string
          customer_phone: string
          customer_phone_normalized: string
          customer_user_id?: string | null
          delivery_address?: string | null
          delivery_fee_centavos?: number | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_notes?: string
          id?: string
          idempotency_key: string
          loyalty_discount_centavos?: number
          loyalty_points_redeemed?: number
          loyalty_processed_at?: string | null
          order_number?: never
          order_status?: string
          order_type?: string
          payment_collected_at?: string | null
          payment_collected_by?: string | null
          payment_method?: string
          payment_status?: string
          request_fingerprint: string
          subtotal_centavos?: number
          tenant_id: string
          total_centavos?: number | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          currency?: string
          customer_name?: string
          customer_phone?: string
          customer_phone_normalized?: string
          customer_user_id?: string | null
          delivery_address?: string | null
          delivery_fee_centavos?: number | null
          delivery_latitude?: number | null
          delivery_longitude?: number | null
          delivery_notes?: string
          id?: string
          idempotency_key?: string
          loyalty_discount_centavos?: number
          loyalty_points_redeemed?: number
          loyalty_processed_at?: string | null
          order_number?: never
          order_status?: string
          order_type?: string
          payment_collected_at?: string | null
          payment_collected_by?: string | null
          payment_method?: string
          payment_status?: string
          request_fingerprint?: string
          subtotal_centavos?: number
          tenant_id?: string
          total_centavos?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_orders_tenant_branch_fk"
            columns: ["tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "customer_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_saved_addresses: {
        Row: {
          address_line: string
          barangay: string
          city: string
          created_at: string
          geocoding_place_id: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line: string
          barangay?: string
          city: string
          created_at?: string
          geocoding_place_id?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line?: string
          barangay?: string
          city?: string
          created_at?: string
          geocoding_place_id?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          branch_id: string
          delivered_at: string | null
          id: string
          order_id: string
          rider_user_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          branch_id: string
          delivered_at?: string | null
          id?: string
          order_id: string
          rider_user_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          branch_id?: string
          delivered_at?: string | null
          id?: string
          order_id?: string
          rider_user_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_assignments_branch_fk"
            columns: ["tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "delivery_assignments_order_fk"
            columns: ["tenant_id", "order_id"]
            isOneToOne: true
            referencedRelation: "customer_orders"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          name: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string
          created_at: string
          description: string
          id: string
          image_path: string | null
          is_popular: boolean
          name: string
          price_centavos: number
          sort_order: number
          status: string
          tenant_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          is_popular?: boolean
          name: string
          price_centavos: number
          sort_order?: number
          status?: string
          tenant_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string
          id?: string
          image_path?: string | null
          is_popular?: boolean
          name?: string
          price_centavos?: number
          sort_order?: number
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_matching_category_fk"
            columns: ["tenant_id", "category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_modifier_groups: {
        Row: {
          id: string
          is_active: boolean
          item_id: string
          max_select: number
          min_select: number
          name: string
          sort_order: number
          tenant_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          item_id: string
          max_select?: number
          min_select?: number
          name: string
          sort_order?: number
          tenant_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          item_id?: string
          max_select?: number
          min_select?: number
          name?: string
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_group_item_fk"
            columns: ["tenant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      menu_modifier_options: {
        Row: {
          group_id: string
          id: string
          is_active: boolean
          item_id: string
          name: string
          price_centavos: number
          sort_order: number
          tenant_id: string
        }
        Insert: {
          group_id: string
          id?: string
          is_active?: boolean
          item_id: string
          name: string
          price_centavos?: number
          sort_order?: number
          tenant_id: string
        }
        Update: {
          group_id?: string
          id?: string
          is_active?: boolean
          item_id?: string
          name?: string
          price_centavos?: number
          sort_order?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_option_group_fk"
            columns: ["tenant_id", "item_id", "group_id"]
            isOneToOne: false
            referencedRelation: "menu_modifier_groups"
            referencedColumns: ["tenant_id", "item_id", "id"]
          },
        ]
      }
      mfa_admin_reset_audit: {
        Row: {
          actor_user_id: string
          created_at: string
          deleted_factor_count: number
          id: string
          target_email: string
          target_role: string
          target_user_id: string
          tenant_id: string | null
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          deleted_factor_count?: number
          id?: string
          target_email?: string
          target_role: string
          target_user_id: string
          tenant_id?: string | null
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          deleted_factor_count?: number
          id?: string
          target_email?: string
          target_role?: string
          target_user_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mfa_admin_reset_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          access_level: string
          created_at: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: []
      }
      platform_theme_defaults: {
        Row: {
          id: number
          updated_at: string
          website_colors: Json
        }
        Insert: {
          id?: number
          updated_at?: string
          website_colors?: Json
        }
        Update: {
          id?: number
          updated_at?: string
          website_colors?: Json
        }
        Relationships: []
      }
      pos_cashier_shift_audit_events: {
        Row: {
          actor_user_id: string
          branch_id: string
          cash_variance_centavos: number | null
          counted_cash_centavos: number | null
          event_type: string
          expected_cash_centavos: number | null
          id: number
          occurred_at: string
          opening_cash_centavos: number
          shift_id: string
          tenant_id: string
        }
        Insert: {
          actor_user_id: string
          branch_id: string
          cash_variance_centavos?: number | null
          counted_cash_centavos?: number | null
          event_type: string
          expected_cash_centavos?: number | null
          id?: never
          occurred_at?: string
          opening_cash_centavos: number
          shift_id: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string
          branch_id?: string
          cash_variance_centavos?: number | null
          counted_cash_centavos?: number | null
          event_type?: string
          expected_cash_centavos?: number | null
          id?: never
          occurred_at?: string
          opening_cash_centavos?: number
          shift_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_cashier_shift_audit_branch_fk"
            columns: ["tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "pos_cashier_shift_audit_events_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_cashier_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_cashier_shifts: {
        Row: {
          branch_id: string
          cash_variance_centavos: number | null
          cashier_user_id: string
          close_note: string | null
          closed_at: string | null
          counted_cash_centavos: number | null
          created_at: string
          expected_cash_centavos: number | null
          id: string
          opened_at: string
          opening_cash_centavos: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          cash_variance_centavos?: number | null
          cashier_user_id: string
          close_note?: string | null
          closed_at?: string | null
          counted_cash_centavos?: number | null
          created_at?: string
          expected_cash_centavos?: number | null
          id?: string
          opened_at?: string
          opening_cash_centavos: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          cash_variance_centavos?: number | null
          cashier_user_id?: string
          close_note?: string | null
          closed_at?: string | null
          counted_cash_centavos?: number | null
          created_at?: string
          expected_cash_centavos?: number | null
          id?: string
          opened_at?: string
          opening_cash_centavos?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_cashier_shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_cashier_shifts_branch_tenant_fk"
            columns: ["tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "pos_cashier_shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_fiscal_profile_audit_events: {
        Row: {
          actor_user_id: string | null
          branch_id: string
          changed_fields: string[]
          event_type: string
          id: number
          new_status: string
          occurred_at: string
          previous_status: string | null
          profile_id: string
          tenant_id: string
          transaction_id: number
        }
        Insert: {
          actor_user_id?: string | null
          branch_id: string
          changed_fields?: string[]
          event_type: string
          id?: never
          new_status: string
          occurred_at?: string
          previous_status?: string | null
          profile_id: string
          tenant_id: string
          transaction_id?: number
        }
        Update: {
          actor_user_id?: string | null
          branch_id?: string
          changed_fields?: string[]
          event_type?: string
          id?: never
          new_status?: string
          occurred_at?: string
          previous_status?: string | null
          profile_id?: string
          tenant_id?: string
          transaction_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_fiscal_profile_audit_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_fiscal_profile_audit_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "pos_fiscal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_fiscal_profile_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_fiscal_profiles: {
        Row: {
          additional_authorization_metadata: Json
          authorization_effective_at: string | null
          authorization_expires_at: string | null
          authorization_reference: string | null
          authorized_at: string | null
          authorized_by: string | null
          branch_id: string
          created_at: string
          created_by: string
          fiscal_status: string
          id: string
          invoice_document_type: string
          invoice_series_prefix: string
          machine_or_terminal_identifier: string | null
          registered_address: string
          software_name: string
          software_version: string
          tax_regime: string
          taxpayer_registered_name: string
          taxpayer_tin: string
          tenant_id: string
          tin_branch_code: string
          trade_name: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          additional_authorization_metadata?: Json
          authorization_effective_at?: string | null
          authorization_expires_at?: string | null
          authorization_reference?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          branch_id: string
          created_at?: string
          created_by: string
          fiscal_status?: string
          id?: string
          invoice_document_type?: string
          invoice_series_prefix: string
          machine_or_terminal_identifier?: string | null
          registered_address: string
          software_name: string
          software_version: string
          tax_regime: string
          taxpayer_registered_name: string
          taxpayer_tin: string
          tenant_id: string
          tin_branch_code: string
          trade_name?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          additional_authorization_metadata?: Json
          authorization_effective_at?: string | null
          authorization_expires_at?: string | null
          authorization_reference?: string | null
          authorized_at?: string | null
          authorized_by?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string
          fiscal_status?: string
          id?: string
          invoice_document_type?: string
          invoice_series_prefix?: string
          machine_or_terminal_identifier?: string | null
          registered_address?: string
          software_name?: string
          software_version?: string
          tax_regime?: string
          taxpayer_registered_name?: string
          taxpayer_tin?: string
          tenant_id?: string
          tin_branch_code?: string
          trade_name?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_fiscal_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_fiscal_profiles_branch_tenant_fk"
            columns: ["tenant_id", "branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "pos_fiscal_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_fiscal_tax_policies: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string
          currency_code: string
          effective_from: string | null
          effective_until: string | null
          fiscal_profile_id: string
          id: string
          policy_name: string
          policy_version: number
          review_reference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rounding_mode: string
          rules: Json
          status: string
          tenant_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by: string
          currency_code?: string
          effective_from?: string | null
          effective_until?: string | null
          fiscal_profile_id: string
          id?: string
          policy_name: string
          policy_version: number
          review_reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rounding_mode?: string
          rules?: Json
          status?: string
          tenant_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string
          currency_code?: string
          effective_from?: string | null
          effective_until?: string | null
          fiscal_profile_id?: string
          id?: string
          policy_name?: string
          policy_version?: number
          review_reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rounding_mode?: string
          rules?: Json
          status?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_fiscal_tax_policies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_fiscal_tax_policies_fiscal_profile_id_fkey"
            columns: ["fiscal_profile_id"]
            isOneToOne: false
            referencedRelation: "pos_fiscal_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_fiscal_tax_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_fiscal_tax_policy_branch_tenant_fk"
            columns: ["tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "pos_fiscal_tax_policy_profile_scope_fk"
            columns: ["fiscal_profile_id", "tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "pos_fiscal_profiles"
            referencedColumns: ["id", "tenant_id", "branch_id"]
          },
        ]
      }
      pos_fiscal_tax_policy_audit_events: {
        Row: {
          actor_user_id: string | null
          branch_id: string
          changed_fields: string[]
          event_type: string
          id: number
          new_status: string
          occurred_at: string
          policy_id: string
          previous_status: string | null
          tenant_id: string
          transaction_id: number
        }
        Insert: {
          actor_user_id?: string | null
          branch_id: string
          changed_fields?: string[]
          event_type: string
          id?: never
          new_status: string
          occurred_at?: string
          policy_id: string
          previous_status?: string | null
          tenant_id: string
          transaction_id?: number
        }
        Update: {
          actor_user_id?: string | null
          branch_id?: string
          changed_fields?: string[]
          event_type?: string
          id?: never
          new_status?: string
          occurred_at?: string
          policy_id?: string
          previous_status?: string | null
          tenant_id?: string
          transaction_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_fiscal_tax_policy_audit_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_fiscal_tax_policy_audit_events_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "pos_fiscal_tax_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_fiscal_tax_policy_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_sale_audit_events: {
        Row: {
          actor_user_id: string
          details: Json
          event_type: string
          id: number
          occurred_at: string
          sale_id: string
          tenant_id: string
        }
        Insert: {
          actor_user_id: string
          details?: Json
          event_type: string
          id?: never
          occurred_at?: string
          sale_id: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string
          details?: Json
          event_type?: string
          id?: never
          occurred_at?: string
          sale_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_audit_sale_fk"
            columns: ["tenant_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      pos_sale_items: {
        Row: {
          created_at: string
          id: string
          item_name_snapshot: string
          line_number: number
          line_total_centavos: number
          menu_item_id: string
          quantity: number
          sale_id: string
          tenant_id: string
          unit_price_centavos: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_name_snapshot: string
          line_number: number
          line_total_centavos: number
          menu_item_id: string
          quantity: number
          sale_id: string
          tenant_id: string
          unit_price_centavos: number
        }
        Update: {
          created_at?: string
          id?: string
          item_name_snapshot?: string
          line_number?: number
          line_total_centavos?: number
          menu_item_id?: string
          quantity?: number
          sale_id?: string
          tenant_id?: string
          unit_price_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sale_items_sale_fk"
            columns: ["tenant_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      pos_sales: {
        Row: {
          branch_id: string
          cash_tendered_centavos: number
          cashier_shift_id: string | null
          cashier_user_id: string
          change_centavos: number
          created_at: string
          currency: string
          customer_name_snapshot: string | null
          customer_user_id: string | null
          id: string
          idempotency_key: string
          payment_method: string
          payment_status: string
          request_fingerprint: string
          sale_number: number
          subtotal_centavos: number
          tenant_id: string
          total_centavos: number
        }
        Insert: {
          branch_id: string
          cash_tendered_centavos: number
          cashier_shift_id?: string | null
          cashier_user_id: string
          change_centavos: number
          created_at?: string
          currency?: string
          customer_name_snapshot?: string | null
          customer_user_id?: string | null
          id?: string
          idempotency_key: string
          payment_method: string
          payment_status?: string
          request_fingerprint: string
          sale_number?: never
          subtotal_centavos: number
          tenant_id: string
          total_centavos: number
        }
        Update: {
          branch_id?: string
          cash_tendered_centavos?: number
          cashier_shift_id?: string | null
          cashier_user_id?: string
          change_centavos?: number
          created_at?: string
          currency?: string
          customer_name_snapshot?: string | null
          customer_user_id?: string | null
          id?: string
          idempotency_key?: string
          payment_method?: string
          payment_status?: string
          request_fingerprint?: string
          sale_number?: never
          subtotal_centavos?: number
          tenant_id?: string
          total_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_sales_cashier_shift_fk"
            columns: ["cashier_shift_id"]
            isOneToOne: false
            referencedRelation: "pos_cashier_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_sales_tenant_branch_fk"
            columns: ["tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      privileged_invitations: {
        Row: {
          accepted_at: string | null
          branch_id: string | null
          created_at: string
          email: string
          expires_at: string
          first_name: string | null
          full_name: string | null
          id: string
          invited_by: string | null
          invited_by_email_snapshot: string | null
          invited_by_name_snapshot: string | null
          invited_user_id: string | null
          last_name: string | null
          role: string
          sent_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          accepted_at?: string | null
          branch_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_by_email_snapshot?: string | null
          invited_by_name_snapshot?: string | null
          invited_user_id?: string | null
          last_name?: string | null
          role: string
          sent_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          accepted_at?: string | null
          branch_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          first_name?: string | null
          full_name?: string | null
          id?: string
          invited_by?: string | null
          invited_by_email_snapshot?: string | null
          invited_by_name_snapshot?: string | null
          invited_user_id?: string | null
          last_name?: string | null
          role?: string
          sent_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "privileged_invitations_branch_fk"
            columns: ["tenant_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "privileged_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_admin_audit_logs: {
        Row: {
          action: string
          admin_email: string | null
          admin_name: string | null
          admin_user_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          restaurant_id: string | null
        }
        Insert: {
          action: string
          admin_email?: string | null
          admin_name?: string | null
          admin_user_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          restaurant_id?: string | null
        }
        Update: {
          action?: string
          admin_email?: string | null
          admin_name?: string | null
          admin_user_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_admin_audit_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_customer_loyalty_accounts: {
        Row: {
          customer_user_id: string
          eligible_spend_centavos: number
          lifetime_points_earned: number
          lifetime_points_redeemed: number
          points_balance: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          customer_user_id: string
          eligible_spend_centavos?: number
          lifetime_points_earned?: number
          lifetime_points_redeemed?: number
          points_balance?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          customer_user_id?: string
          eligible_spend_centavos?: number
          lifetime_points_earned?: number
          lifetime_points_redeemed?: number
          points_balance?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_customer_loyalty_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_customer_loyalty_transactions: {
        Row: {
          created_at: string
          customer_user_id: string
          description: string
          id: string
          order_id: string | null
          points_change: number
          pos_sale_id: string | null
          tenant_id: string
          transaction_type: string
        }
        Insert: {
          created_at?: string
          customer_user_id: string
          description?: string
          id?: string
          order_id?: string | null
          points_change: number
          pos_sale_id?: string | null
          tenant_id: string
          transaction_type: string
        }
        Update: {
          created_at?: string
          customer_user_id?: string
          description?: string
          id?: string
          order_id?: string | null
          points_change?: number
          pos_sale_id?: string | null
          tenant_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_customer_loyalty_transac_tenant_id_customer_user_id_fkey"
            columns: ["tenant_id", "customer_user_id"]
            isOneToOne: false
            referencedRelation: "tenant_customer_loyalty_accounts"
            referencedColumns: ["tenant_id", "customer_user_id"]
          },
          {
            foreignKeyName: "tenant_customer_loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_customer_loyalty_transactions_pos_sale_id_fkey"
            columns: ["pos_sale_id"]
            isOneToOne: false
            referencedRelation: "pos_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_customer_loyalty_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          activated_at: string | null
          challenge_token_sha256: string | null
          created_at: string
          hostname: string
          id: string
          kind: string
          status: string
          tenant_id: string
          verified_at: string | null
        }
        Insert: {
          activated_at?: string | null
          challenge_token_sha256?: string | null
          created_at?: string
          hostname: string
          id?: string
          kind?: string
          status?: string
          tenant_id: string
          verified_at?: string | null
        }
        Update: {
          activated_at?: string | null
          challenge_token_sha256?: string | null
          created_at?: string
          hostname?: string
          id?: string
          kind?: string
          status?: string
          tenant_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_loyalty_settings: {
        Row: {
          amount_threshold: number
          enabled: boolean
          points_awarded: number
          redemption_amount: number
          redemption_enabled: boolean
          redemption_points: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_threshold?: number
          enabled?: boolean
          points_awarded?: number
          redemption_amount?: number
          redemption_enabled?: boolean
          redemption_points?: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_threshold?: number
          enabled?: boolean
          points_awarded?: number
          redemption_amount?: number
          redemption_enabled?: boolean
          redemption_points?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_loyalty_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          disabled_at: string | null
          id: string
          role: string
          staff_first_name: string | null
          staff_last_name: string | null
          staff_phone: string | null
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          disabled_at?: string | null
          id?: string
          role: string
          staff_first_name?: string | null
          staff_last_name?: string | null
          staff_phone?: string | null
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          disabled_at?: string | null
          id?: string
          role?: string
          staff_first_name?: string | null
          staff_last_name?: string | null
          staff_phone?: string | null
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_paymongo_accounts: {
        Row: {
          activation_status: string | null
          connection_status: string
          created_at: string
          environment: string
          identity_verification_status: string | null
          invitation_email: string | null
          invitation_id: string | null
          last_error: string | null
          onboarding_method: string
          onboarding_step: string | null
          paymongo_account_id: string | null
          tenant_id: string
          updated_at: string
          verification_url: string | null
          webhook_id: string | null
          webhook_secret_id: string | null
        }
        Insert: {
          activation_status?: string | null
          connection_status?: string
          created_at?: string
          environment?: string
          identity_verification_status?: string | null
          invitation_email?: string | null
          invitation_id?: string | null
          last_error?: string | null
          onboarding_method?: string
          onboarding_step?: string | null
          paymongo_account_id?: string | null
          tenant_id: string
          updated_at?: string
          verification_url?: string | null
          webhook_id?: string | null
          webhook_secret_id?: string | null
        }
        Update: {
          activation_status?: string | null
          connection_status?: string
          created_at?: string
          environment?: string
          identity_verification_status?: string | null
          invitation_email?: string | null
          invitation_id?: string | null
          last_error?: string | null
          onboarding_method?: string
          onboarding_step?: string | null
          paymongo_account_id?: string | null
          tenant_id?: string
          updated_at?: string
          verification_url?: string | null
          webhook_id?: string | null
          webhook_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_paymongo_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_paymongo_webhook_events: {
        Row: {
          attempts: number
          environment: string
          event_id: string
          event_type: string
          last_error: string | null
          processed_at: string | null
          received_at: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          attempts?: number
          environment: string
          event_id: string
          event_type: string
          last_error?: string | null
          processed_at?: string | null
          received_at?: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          attempts?: number
          environment?: string
          event_id?: string
          event_type?: string
          last_error?: string | null
          processed_at?: string | null
          received_at?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_paymongo_webhook_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_pos_integration_audit_events: {
        Row: {
          actor_user_id: string
          created_at: string
          details: Json
          event_type: string
          id: string
          new_status: string
          previous_status: string
          tenant_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          new_status: string
          previous_status: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          new_status?: string
          previous_status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_pos_integration_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_pos_integrations: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          requested_at: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          suspended_at: string | null
          suspended_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          requested_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          requested_at?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_pos_integrations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_staff_audit_events: {
        Row: {
          actor_user_id: string
          after_state: Json
          before_state: Json
          event_type: string
          id: number
          occurred_at: string
          target_user_id: string
          tenant_id: string
        }
        Insert: {
          actor_user_id: string
          after_state?: Json
          before_state?: Json
          event_type: string
          id?: never
          occurred_at?: string
          target_user_id: string
          tenant_id: string
        }
        Update: {
          actor_user_id?: string
          after_state?: Json
          before_state?: Json
          event_type?: string
          id?: never
          occurred_at?: string
          target_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_staff_audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_storefronts: {
        Row: {
          accepting_orders: boolean
          cash_payment_options: Json
          created_at: string
          default_branch_id: string
          delivery_location_latitude: number | null
          delivery_location_longitude: number | null
          delivery_pricing: Json
          display_name: string
          favicon_path: string | null
          font_family: string
          hero_emphasis: string
          hero_heading: string
          logo_path: string | null
          online_payments: Json
          opening_hours: Json
          primary_color: string
          restaurant_address: string | null
          rider_assignment: Json
          social_links: Json
          status: string
          store_address: string | null
          tagline: string
          tax_settings: Json
          tenant_id: string
          updated_at: string
          website_colors: Json
        }
        Insert: {
          accepting_orders?: boolean
          cash_payment_options?: Json
          created_at?: string
          default_branch_id: string
          delivery_location_latitude?: number | null
          delivery_location_longitude?: number | null
          delivery_pricing?: Json
          display_name: string
          favicon_path?: string | null
          font_family?: string
          hero_emphasis?: string
          hero_heading?: string
          logo_path?: string | null
          online_payments?: Json
          opening_hours?: Json
          primary_color?: string
          restaurant_address?: string | null
          rider_assignment?: Json
          social_links?: Json
          status?: string
          store_address?: string | null
          tagline?: string
          tax_settings?: Json
          tenant_id: string
          updated_at?: string
          website_colors?: Json
        }
        Update: {
          accepting_orders?: boolean
          cash_payment_options?: Json
          created_at?: string
          default_branch_id?: string
          delivery_location_latitude?: number | null
          delivery_location_longitude?: number | null
          delivery_pricing?: Json
          display_name?: string
          favicon_path?: string | null
          font_family?: string
          hero_emphasis?: string
          hero_heading?: string
          logo_path?: string | null
          online_payments?: Json
          opening_hours?: Json
          primary_color?: string
          restaurant_address?: string | null
          rider_assignment?: Json
          social_links?: Json
          status?: string
          store_address?: string | null
          tagline?: string
          tax_settings?: Json
          tenant_id?: string
          updated_at?: string
          website_colors?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tenant_storefronts_branch_fk"
            columns: ["tenant_id", "default_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tenant_storefronts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_privileged_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      admin_create_restaurant: {
        Args: {
          p_branch_name: string
          p_branch_slug: string
          p_name: string
          p_slug: string
        }
        Returns: string
      }
      apply_customer_loyalty_redemption: {
        Args: {
          p_customer_user_id: string
          p_order_id: string
          p_points_to_redeem: number
          p_tracking_token: string
        }
        Returns: Json
      }
      assign_order_rider: {
        Args: {
          p_order_id: string
          p_rider_user_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      authorize_staff_order_cancellation: {
        Args: { p_order_id: string; p_tenant_id: string }
        Returns: boolean
      }
      cancel_customer_order: {
        Args: { p_tracking_token: string }
        Returns: Json
      }
      check_storefront_order_availability: {
        Args: { p_branch_slug?: string; p_slug: string }
        Returns: Json
      }
      claim_initial_admin_bootstrap: { Args: never; Returns: boolean }
      claim_system_admin_invitation: { Args: never; Returns: boolean }
      claim_tenant_paymongo_webhook_event: {
        Args: {
          p_environment: string
          p_event_id: string
          p_event_type: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      close_pos_cashier_shift: {
        Args: {
          p_actor_user_id: string
          p_branch_id: string
          p_close_note?: string
          p_counted_cash_centavos: number
        }
        Returns: Json
      }
      create_customer_order:
        | {
            Args: {
              p_branch_slug: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery_address: string
              p_delivery_notes: string
              p_idempotency_key: string
              p_items: Json
              p_order_type: string
              p_restaurant_slug: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_branch_slug: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery_address: string
              p_delivery_latitude?: number
              p_delivery_longitude?: number
              p_delivery_notes: string
              p_idempotency_key: string
              p_items: Json
              p_order_type: string
              p_restaurant_slug: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_branch_slug: string
              p_customer_name: string
              p_customer_phone: string
              p_delivery_address: string
              p_delivery_notes: string
              p_idempotency_key: string
              p_items: Json
              p_order_type: string
              p_payment_method: string
              p_restaurant_slug: string
            }
            Returns: Json
          }
      create_owner_branch: {
        Args: { p_name: string; p_slug: string; p_tenant_id: string }
        Returns: string
      }
      create_pos_cash_sale: {
        Args: {
          p_actor_user_id: string
          p_branch_id: string
          p_cash_tendered_centavos: number
          p_idempotency_key: string
          p_items: Json
        }
        Returns: Json
      }
      create_pos_cash_sale_with_customer: {
        Args: {
          p_actor_user_id: string
          p_branch_id: string
          p_cash_tendered_centavos: number
          p_customer_name: string
          p_customer_user_id: string
          p_idempotency_key: string
          p_items: Json
        }
        Returns: Json
      }
      current_system_admin_access_level: { Args: never; Returns: string }
      current_system_admin_invitation_access_level: {
        Args: never
        Returns: string
      }
      customer_order_history: { Args: never; Returns: Json }
      default_storefront_website_colors: { Args: never; Returns: Json }
      delete_owner_menu_item: {
        Args: { p_item_id: string; p_tenant_id: string }
        Returns: boolean
      }
      delete_owner_menu_modifier_option: {
        Args: { p_option_id: string; p_tenant_id: string }
        Returns: boolean
      }
      delete_owner_modifier_group: {
        Args: { p_group_id: string; p_tenant_id: string }
        Returns: boolean
      }
      fail_customer_order_cancellation_refund: {
        Args: {
          p_payment_session_id: string
          p_refund_attempt_key: string
          p_tenant_id: string
        }
        Returns: Json
      }
      finalize_customer_order_payment: {
        Args: {
          p_amount_centavos: number
          p_checkout_session_id: string
          p_environment: string
          p_tenant_id: string
        }
        Returns: Json
      }
      finalize_customer_order_payment_failure: {
        Args: {
          p_checkout_session_id: string
          p_environment: string
          p_tenant_id: string
        }
        Returns: Json
      }
      finalize_customer_order_refund: {
        Args: {
          p_payment_session_id: string
          p_refund_id: string
          p_refunded_amount_centavos: number
          p_tenant_id: string
        }
        Returns: Json
      }
      get_branch_payment_options: {
        Args: { p_branch_slug: string; p_slug: string }
        Returns: Json
      }
      get_branch_storefront: {
        Args: { p_branch_slug?: string; p_slug: string }
        Returns: Json
      }
      get_customer_order_branch_location: {
        Args: { p_tracking_token: string }
        Returns: Json
      }
      get_my_pos_integration_status: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      get_my_staff_display_name: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      get_workspace_storefront_favicon: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      get_workspace_tenant_domain: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      get_pos_cashier_shift: {
        Args: { p_actor_user_id: string; p_branch_id: string }
        Returns: Json
      }
      get_public_branch_address: {
        Args: { p_branch_slug?: string; p_slug: string }
        Returns: string
      }
      get_public_cash_payment_options: {
        Args: { p_branch_slug?: string; p_slug: string }
        Returns: Json
      }
      get_public_storefront_directory: { Args: never; Returns: Json }
      get_public_storefront_favicon: { Args: { p_slug: string }; Returns: Json }
      get_published_storefront: { Args: { p_slug: string }; Returns: Json }
      get_staff_sales_schedule: { Args: { p_tenant_id: string }; Returns: Json }
      get_tenant_paymongo_webhook_secret: {
        Args: { p_environment?: string; p_tenant_id: string }
        Returns: string
      }
      get_tenant_pos_integration: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      is_initial_admin_bootstrap_candidate: { Args: never; Returns: boolean }
      is_system_admin_invitation_candidate: { Args: never; Returns: boolean }
      list_branch_riders: {
        Args: { p_branch_id: string; p_tenant_id: string }
        Returns: Json
      }
      list_customer_orders: {
        Args: { p_filter?: string; p_limit?: number; p_tenant_id: string }
        Returns: Json
      }
      list_kitchen_menu: {
        Args: { p_branch_id?: string; p_tenant_id: string }
        Returns: Json
      }
      list_staff_orders: {
        Args: { p_filter?: string; p_limit?: number; p_tenant_id: string }
        Returns: Json
      }
      list_tenant_staff: { Args: { p_tenant_id: string }; Returns: Json }
      open_pos_cashier_shift: {
        Args: {
          p_actor_user_id: string
          p_branch_id: string
          p_opening_cash_centavos: number
        }
        Returns: Json
      }
      owner_set_tenant_staff_status: {
        Args: { p_status: string; p_tenant_id: string; p_user_id: string }
        Returns: Json
      }
      owner_update_tenant_staff: {
        Args: {
          p_first_name: string
          p_last_name: string
          p_phone: string
          p_role: string
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      prepare_customer_order_cancellation: {
        Args: {
          p_order_id?: string
          p_tenant_id?: string
          p_tracking_token?: string
        }
        Returns: Json
      }
      privileged_route_eligible: {
        Args: { p_workspace: string }
        Returns: boolean
      }
      request_customer_order_refund: {
        Args: { p_order_id: string; p_reason?: string; p_tenant_id: string }
        Returns: Json
      }
      request_pos_integration: { Args: { p_tenant_id: string }; Returns: Json }
      request_privileged_invitation: {
        Args: {
          p_branch_id?: string
          p_email: string
          p_role: string
          p_tenant_id: string
        }
        Returns: string
      }
      resolve_public_storefront_domain: {
        Args: { p_hostname: string }
        Returns: Json
      }
      resolve_restaurant_by_domain: {
        Args: { p_hostname: string }
        Returns: {
          id: string
        }[]
      }
      resolve_restaurant_by_slug: {
        Args: { p_slug: string }
        Returns: {
          id: string
        }[]
      }
      rider_complete_cod_delivery: {
        Args: { p_order_id: string; p_tenant_id: string }
        Returns: Json
      }
      set_customer_order_delivery_fee: {
        Args: {
          p_delivery_fee_centavos: number
          p_order_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      set_kitchen_menu_item_availability: {
        Args: {
          p_branch_id: string
          p_is_available: boolean
          p_item_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      set_tenant_order_acceptance: {
        Args: { p_accepting: boolean; p_tenant_id: string }
        Returns: Json
      }
      set_tenant_paymongo_webhook_secret: {
        Args: { p_environment?: string; p_secret: string; p_tenant_id: string }
        Returns: string
      }
      set_tenant_pos_integration: {
        Args: { p_action: string; p_reason?: string; p_tenant_id: string }
        Returns: Json
      }
      system_admin_assign_restaurant_owner: {
        Args: { p_email: string; p_restaurant_id: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      system_admin_bootstrap_candidate_for_service: {
        Args: { p_email: string; p_user_id: string }
        Returns: boolean
      }
      system_admin_create_branch: {
        Args: { p_name: string; p_slug: string; p_tenant_id: string }
        Returns: string
      }
      system_admin_delete_deactivated_staff: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: boolean
      }
      system_admin_delete_empty_tenant: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      system_admin_delete_revoked_access: {
        Args: { p_admin_user_id: string }
        Returns: boolean
      }
      system_admin_edit_branch: {
        Args: {
          p_branch_id: string
          p_name: string
          p_slug: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      system_admin_finalize_auth_user_deletion: {
        Args: {
          p_access_level: string
          p_actor_user_id: string
          p_target_email: string
          p_target_user_id: string
        }
        Returns: boolean
      }
      system_admin_get_administrators: {
        Args: never
        Returns: {
          access_level: string
          admin_user_id: string
          created_at: string
          email: string
          granted_by: string
          granted_by_email: string
          id: string
          is_active: boolean
          name: string
          status: string
          updated_at: string
        }[]
      }
      system_admin_get_audit_logs: {
        Args: {
          p_end_date?: string
          p_event_type?: string
          p_limit?: number
          p_offset?: number
          p_restaurant_id?: string
          p_search?: string
          p_start_date?: string
        }
        Returns: {
          action: string
          admin_email: string
          admin_name: string
          admin_user_id: string
          created_at: string
          details: Json
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          restaurant_id: string
          restaurant_name: string
        }[]
      }
      system_admin_get_online_payments_enabled: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      system_admin_get_restaurant_overview: {
        Args: { p_restaurant_id: string }
        Returns: {
          custom_domain: string
          restaurant_address: string
          store_address: string
          tagline: string
        }[]
      }
      system_admin_get_restaurant_owner: {
        Args: { p_restaurant_id: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      system_admin_get_restaurant_settings: {
        Args: { p_restaurant_id: string }
        Returns: {
          automatic_rider_assignment_enabled: boolean
          cash_on_delivery_enabled: boolean
          cash_on_pickup_enabled: boolean
          cash_on_take_out_enabled: boolean
          tax_prices_vat_inclusive: boolean
          tax_vat_rate: number
          tax_vat_registered: boolean
        }[]
      }
      system_admin_get_restaurant_staff: {
        Args: { p_restaurant_id: string }
        Returns: {
          auth_user_id: string
          email: string
          id: string
          is_active: boolean
          mobile_number: string
          name: string
          role: string
        }[]
      }
      system_admin_invitation_candidate_for_service: {
        Args: { p_email: string; p_user_id: string }
        Returns: boolean
      }
      system_admin_invitation_finalize_for_service: {
        Args: { p_invitation_id: string; p_user_id: string }
        Returns: boolean
      }
      system_admin_invitation_prepare_for_service: {
        Args: {
          p_access_level: string
          p_email: string
          p_invited_by: string
          p_name: string
        }
        Returns: string
      }
      system_admin_invitation_prepare_with_names_for_service: {
        Args: {
          p_access_level: string
          p_email: string
          p_first_name: string
          p_invited_by: string
          p_last_name: string
        }
        Returns: string
      }
      system_admin_list_branches: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      system_admin_list_deactivated_staff: { Args: never; Returns: Json }
      system_admin_list_online_payment_entitlements: {
        Args: never
        Returns: {
          enabled: boolean
          tenant_id: string
        }[]
      }
      system_admin_record_auth_event: {
        Args: { p_action: string; p_details?: Json; p_event_type: string }
        Returns: string
      }
      system_admin_remove_restaurant_owner: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      system_admin_restore_access: {
        Args: { p_admin_user_id: string }
        Returns: boolean
      }
      system_admin_revoke_access: {
        Args: { p_admin_user_id: string }
        Returns: boolean
      }
      system_admin_set_access_level: {
        Args: { p_access_level: string; p_admin_user_id: string }
        Returns: boolean
      }
      system_admin_set_online_payments: {
        Args: { p_enabled: boolean; p_tenant_id: string }
        Returns: boolean
      }
      system_admin_set_online_payments_enabled: {
        Args: { p_enabled: boolean; p_restaurant_id: string }
        Returns: boolean
      }
      system_admin_set_restaurant_domain: {
        Args: { p_custom_domain: string; p_restaurant_id: string }
        Returns: string
      }
      system_admin_set_restaurant_staff_active: {
        Args: {
          p_is_active: boolean
          p_restaurant_id: string
          p_staff_id: string
        }
        Returns: boolean
      }
      system_admin_set_restaurant_status: {
        Args: { p_is_active: boolean; p_restaurant_id: string }
        Returns: string
      }
      system_admin_update_branch: {
        Args: {
          p_active: boolean
          p_branch_id: string
          p_name: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      system_admin_update_restaurant_settings: {
        Args: {
          p_automatic_rider_assignment_enabled: boolean
          p_cash_on_delivery_enabled: boolean
          p_cash_on_pickup_enabled: boolean
          p_cash_on_take_out_enabled: boolean
          p_restaurant_id: string
          p_tax_prices_vat_inclusive: boolean
          p_tax_vat_rate: number
          p_tax_vat_registered: boolean
        }
        Returns: {
          automatic_rider_assignment_enabled: boolean
          cash_on_delivery_enabled: boolean
          cash_on_pickup_enabled: boolean
          cash_on_take_out_enabled: boolean
          tax_prices_vat_inclusive: boolean
          tax_vat_rate: number
          tax_vat_registered: boolean
        }[]
      }
      system_admin_write_audit_log: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity_id?: string
          p_entity_type?: string
          p_event_type: string
          p_restaurant_id?: string
        }
        Returns: string
      }
      track_customer_order: {
        Args: { p_tracking_token: string }
        Returns: Json
      }
      transition_customer_order: {
        Args: { p_action: string; p_order_id: string; p_tenant_id: string }
        Returns: Json
      }
      transition_staff_order: {
        Args: { p_action: string; p_order_id: string; p_tenant_id: string }
        Returns: Json
      }
      update_owner_branch: {
        Args: {
          p_active: boolean
          p_branch_id: string
          p_name: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      update_owner_branch_accepting_orders: {
        Args: {
          p_accepting_orders: boolean
          p_branch_id: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      update_owner_branch_contact_phone: {
        Args: {
          p_branch_id: string
          p_contact_phone: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      update_owner_branch_delivery_settings: {
        Args: {
          p_branch_id: string
          p_delivery_pricing: Json
          p_latitude: number
          p_longitude: number
          p_store_address: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      update_owner_branch_pickup_address: {
        Args: {
          p_branch_id: string
          p_pickup_address: string
          p_tenant_id: string
        }
        Returns: boolean
      }
      update_owner_storefront_accepting_orders: {
        Args: { p_accepting_orders: boolean; p_tenant_id: string }
        Returns: boolean
      }
      web2table_admin_dashboard_snapshot: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
