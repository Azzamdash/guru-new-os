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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          author_id: string | null
          content: string
          cover_image_url: string | null
          created_at: string
          id: string
          images: Json
          links: Json
          published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content?: string
          cover_image_url?: string | null
          created_at?: string
          id?: string
          images?: Json
          links?: Json
          published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          cover_image_url?: string | null
          created_at?: string
          id?: string
          images?: Json
          links?: Json
          published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      brand_integrations: {
        Row: {
          brand_id: string
          config: Json
          created_at: string
          credentials_ciphertext: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          last_sync_summary: Json | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          config?: Json
          created_at?: string
          credentials_ciphertext?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_sync_summary?: Json | null
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          config?: Json
          created_at?: string
          credentials_ciphertext?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_sync_summary?: Json | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_integrations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          active: boolean
          cogs_percent_default: number | null
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
          type: Database["public"]["Enums"]["brand_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          cogs_percent_default?: number | null
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          type?: Database["public"]["Enums"]["brand_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          cogs_percent_default?: number | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          type?: Database["public"]["Enums"]["brand_type"]
          updated_at?: string
        }
        Relationships: []
      }
      cash_transactions: {
        Row: {
          amount: number
          brand_id: string | null
          category_id: string | null
          courier_id: string | null
          created_at: string
          created_by: string | null
          expense_entry_id: string | null
          for_user_id: string | null
          id: string
          note: string | null
          occurred_at: string
          transfer_group: string | null
          type: Database["public"]["Enums"]["cash_txn_type"]
          updated_at: string
          wallet_id: string | null
        }
        Insert: {
          amount: number
          brand_id?: string | null
          category_id?: string | null
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_entry_id?: string | null
          for_user_id?: string | null
          id?: string
          note?: string | null
          occurred_at?: string
          transfer_group?: string | null
          type: Database["public"]["Enums"]["cash_txn_type"]
          updated_at?: string
          wallet_id?: string | null
        }
        Update: {
          amount?: number
          brand_id?: string | null
          category_id?: string | null
          courier_id?: string | null
          created_at?: string
          created_by?: string | null
          expense_entry_id?: string | null
          for_user_id?: string | null
          id?: string
          note?: string | null
          occurred_at?: string
          transfer_group?: string | null
          type?: Database["public"]["Enums"]["cash_txn_type"]
          updated_at?: string
          wallet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_expense_entry_id_fkey"
            columns: ["expense_entry_id"]
            isOneToOne: false
            referencedRelation: "expense_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      company_assets: {
        Row: {
          annual_depreciation_rate: number
          brand_id: string | null
          cost: number
          created_at: string
          id: string
          name: string
          notes: string | null
          purchase_date: string
          updated_at: string
        }
        Insert: {
          annual_depreciation_rate?: number
          brand_id?: string | null
          cost?: number
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          purchase_date?: string
          updated_at?: string
        }
        Update: {
          annual_depreciation_rate?: number
          brand_id?: string | null
          cost?: number
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          purchase_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_assets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          active: boolean
          brand_id: string | null
          contact: string | null
          created_at: string
          id: string
          name: string
          opening_balance: number
          type: Database["public"]["Enums"]["courier_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_id?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          opening_balance?: number
          type?: Database["public"]["Enums"]["courier_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_id?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          opening_balance?: number
          type?: Database["public"]["Enums"]["courier_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "couriers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_brands: {
        Row: {
          brand_id: string
          created_at: string
          customer_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          customer_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          customer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_brands_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          customer_id: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          customer_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          customer_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          email_norm: string | null
          first_seen_at: string
          governorate: string | null
          id: string
          is_general: boolean
          last_seen_at: string | null
          name: string
          phone: string | null
          phone_norm: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_norm?: string | null
          first_seen_at?: string
          governorate?: string | null
          id?: string
          is_general?: boolean
          last_seen_at?: string | null
          name: string
          phone?: string | null
          phone_norm?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          email_norm?: string | null
          first_seen_at?: string
          governorate?: string | null
          id?: string
          is_general?: boolean
          last_seen_at?: string | null
          name?: string
          phone?: string | null
          phone_norm?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      employee_attendance_entries: {
        Row: {
          approved: boolean
          bonuses: number
          created_at: string
          days_absent: number
          days_vacation: number
          deductions: number
          employee_id: string
          id: string
          month: number
          note: string | null
          times_late: number
          updated_at: string
          year: number
        }
        Insert: {
          approved?: boolean
          bonuses?: number
          created_at?: string
          days_absent?: number
          days_vacation?: number
          deductions?: number
          employee_id: string
          id?: string
          month: number
          note?: string | null
          times_late?: number
          updated_at?: string
          year: number
        }
        Update: {
          approved?: boolean
          bonuses?: number
          created_at?: string
          days_absent?: number
          days_vacation?: number
          deductions?: number
          employee_id?: string
          id?: string
          month?: number
          note?: string | null
          times_late?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_attendance_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_requests: {
        Row: {
          amount: number | null
          created_at: string
          employee_id: string | null
          id: string
          note: string | null
          proof_url: string | null
          requested_date: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["employee_request_status"]
          type: Database["public"]["Enums"]["employee_request_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          employee_id?: string | null
          id?: string
          note?: string | null
          proof_url?: string | null
          requested_date: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["employee_request_status"]
          type: Database["public"]["Enums"]["employee_request_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          employee_id?: string | null
          id?: string
          note?: string | null
          proof_url?: string | null
          requested_date?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["employee_request_status"]
          type?: Database["public"]["Enums"]["employee_request_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_time_logs: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          employee_id: string
          id: string
          log_date: string
          note: string | null
          updated_at: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id: string
          id?: string
          log_date: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          log_date?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_time_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          brand_id: string
          created_at: string
          hourly_rate: number | null
          id: string
          monthly_work_hours: number | null
          name: string
          note: string | null
          off_days: number[] | null
          position: string | null
          salary: number
          updated_at: string
          user_id: string | null
          work_end_time: string | null
          work_start_time: string | null
        }
        Insert: {
          active?: boolean
          brand_id: string
          created_at?: string
          hourly_rate?: number | null
          id?: string
          monthly_work_hours?: number | null
          name: string
          note?: string | null
          off_days?: number[] | null
          position?: string | null
          salary?: number
          updated_at?: string
          user_id?: string | null
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Update: {
          active?: boolean
          brand_id?: string
          created_at?: string
          hourly_rate?: number | null
          id?: string
          monthly_work_hours?: number | null
          name?: string
          note?: string | null
          off_days?: number[] | null
          position?: string | null
          salary?: number
          updated_at?: string
          user_id?: string | null
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      expense_entries: {
        Row: {
          amount: number
          attendance_id: string | null
          attributed_revenue: number
          brand_id: string
          cash_transaction_id: string | null
          category_id: string
          created_at: string
          id: string
          month: number
          note: string | null
          period_date: string | null
          period_end_date: string | null
          period_type: string
          platform: Database["public"]["Enums"]["marketing_platform"] | null
          updated_at: string
          year: number
        }
        Insert: {
          amount?: number
          attendance_id?: string | null
          attributed_revenue?: number
          brand_id: string
          cash_transaction_id?: string | null
          category_id: string
          created_at?: string
          id?: string
          month: number
          note?: string | null
          period_date?: string | null
          period_end_date?: string | null
          period_type?: string
          platform?: Database["public"]["Enums"]["marketing_platform"] | null
          updated_at?: string
          year: number
        }
        Update: {
          amount?: number
          attendance_id?: string | null
          attributed_revenue?: number
          brand_id?: string
          cash_transaction_id?: string | null
          category_id?: string
          created_at?: string
          id?: string
          month?: number
          note?: string | null
          period_date?: string | null
          period_end_date?: string | null
          period_type?: string
          platform?: Database["public"]["Enums"]["marketing_platform"] | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_entries_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "employee_attendance_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_entries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_entries_cash_transaction_id_fkey"
            columns: ["cash_transaction_id"]
            isOneToOne: false
            referencedRelation: "cash_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_audit_log: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string | null
          table_name: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id?: string | null
          table_name: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      fulfillment_entries: {
        Row: {
          brand_id: string | null
          created_at: string
          employee_id: string | null
          employee_name: string
          id: string
          note: string | null
          occurred_at: string
          orders_prepared: number
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name: string
          id?: string
          note?: string | null
          occurred_at?: string
          orders_prepared?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name?: string
          id?: string
          note?: string | null
          occurred_at?: string
          orders_prepared?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_entries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_entries_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_logs: {
        Row: {
          actor_id: string | null
          brand_id: string | null
          created_at: string
          direction: string
          http_status: number | null
          id: string
          metadata: Json | null
          operation: string
          order_id: string | null
          order_number: string | null
          provider: string
          reason: string | null
          request: Json | null
          response: Json | null
          status: string
          tracking_number: string | null
        }
        Insert: {
          actor_id?: string | null
          brand_id?: string | null
          created_at?: string
          direction: string
          http_status?: number | null
          id?: string
          metadata?: Json | null
          operation: string
          order_id?: string | null
          order_number?: string | null
          provider: string
          reason?: string | null
          request?: Json | null
          response?: Json | null
          status: string
          tracking_number?: string | null
        }
        Update: {
          actor_id?: string | null
          brand_id?: string | null
          created_at?: string
          direction?: string
          http_status?: number | null
          id?: string
          metadata?: Json | null
          operation?: string
          order_id?: string | null
          order_number?: string | null
          provider?: string
          reason?: string | null
          request?: Json | null
          response?: Json | null
          status?: string
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_logs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          note: string | null
          occurred_at: string
          product_id: string
          qty: number
          type: Database["public"]["Enums"]["inventory_movement_type"]
          unit_cost: number | null
          updated_at: string
          worker_name: string | null
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          note?: string | null
          occurred_at?: string
          product_id: string
          qty: number
          type: Database["public"]["Enums"]["inventory_movement_type"]
          unit_cost?: number | null
          updated_at?: string
          worker_name?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          note?: string | null
          occurred_at?: string
          product_id?: string
          qty?: number
          type?: Database["public"]["Enums"]["inventory_movement_type"]
          unit_cost?: number | null
          updated_at?: string
          worker_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_brand_shares: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          investor_id: string
          share_percentage: number
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          investor_id: string
          share_percentage: number
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          investor_id?: string
          share_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_brand_shares_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_brand_shares_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
        ]
      }
      investors: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      material_brands: {
        Row: {
          brand_id: string
          created_at: string
          material_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          material_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          material_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_brands_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          unit: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          unit?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      monthly_entries: {
        Row: {
          brand_id: string
          cash_position: number
          created_at: string
          id: string
          month: number
          note: string | null
          orders_confirmed: number
          orders_delivered: number
          orders_returned: number
          orders_total: number
          period_date: string | null
          period_end_date: string | null
          period_type: string
          revenue: number
          service_clients: number
          service_projects: number
          updated_at: string
          year: number
        }
        Insert: {
          brand_id: string
          cash_position?: number
          created_at?: string
          id?: string
          month: number
          note?: string | null
          orders_confirmed?: number
          orders_delivered?: number
          orders_returned?: number
          orders_total?: number
          period_date?: string | null
          period_end_date?: string | null
          period_type?: string
          revenue?: number
          service_clients?: number
          service_projects?: number
          updated_at?: string
          year: number
        }
        Update: {
          brand_id?: string
          cash_position?: number
          created_at?: string
          id?: string
          month?: number
          note?: string | null
          orders_confirmed?: number
          orders_delivered?: number
          orders_returned?: number
          orders_total?: number
          period_date?: string | null
          period_end_date?: string | null
          period_type?: string
          revenue?: number
          service_clients?: number
          service_projects?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_entries_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          qty: number
          sku: string | null
          subtotal: number
          title: string
          unit_cost: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          qty?: number
          sku?: string | null
          subtotal?: number
          title: string
          unit_cost?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          qty?: number
          sku?: string | null
          subtotal?: number
          title?: string
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          apartment_number: string | null
          brand_id: string
          building_number: string | null
          confirmation_status: string
          cost_total: number
          courier_id: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_amount: number
          employee_id: string | null
          external_id: string | null
          external_order_number: string | null
          financial_status: string
          floor_number: string | null
          fulfillment_status: string
          id: string
          invoice_id: string | null
          note: string | null
          occurred_at: string
          raw: Json | null
          shipping_address: string | null
          shipping_amount: number
          shipping_governorate: string | null
          source: string
          subtotal_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          apartment_number?: string | null
          brand_id: string
          building_number?: string | null
          confirmation_status?: string
          cost_total?: number
          courier_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number
          employee_id?: string | null
          external_id?: string | null
          external_order_number?: string | null
          financial_status?: string
          floor_number?: string | null
          fulfillment_status?: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          occurred_at?: string
          raw?: Json | null
          shipping_address?: string | null
          shipping_amount?: number
          shipping_governorate?: string | null
          source?: string
          subtotal_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          apartment_number?: string | null
          brand_id?: string
          building_number?: string | null
          confirmation_status?: string
          cost_total?: number
          courier_id?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number
          employee_id?: string | null
          external_id?: string | null
          external_order_number?: string | null
          financial_status?: string
          floor_number?: string | null
          fulfillment_status?: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          occurred_at?: string
          raw?: Json | null
          shipping_address?: string | null
          shipping_amount?: number
          shipping_governorate?: string | null
          source?: string
          subtotal_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      product_materials: {
        Row: {
          created_at: string
          id: string
          material_id: string
          product_id: string
          qty_per_unit: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          product_id: string
          qty_per_unit?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          product_id?: string
          qty_per_unit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_materials_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      production_tasks: {
        Row: {
          assignee_id: string | null
          brand_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_tasks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          brand_id: string
          cogs_override: number | null
          cogs_percent: number | null
          created_at: string
          id: string
          lead_time_days: number
          moving_avg_cost: number | null
          name: string
          on_hand_qty: number
          reorder_point: number
          sell_price: number
          sku: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_id: string
          cogs_override?: number | null
          cogs_percent?: number | null
          created_at?: string
          id?: string
          lead_time_days?: number
          moving_avg_cost?: number | null
          name: string
          on_hand_qty?: number
          reorder_point?: number
          sell_price?: number
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_id?: string
          cogs_override?: number | null
          cogs_percent?: number | null
          created_at?: string
          id?: string
          lead_time_days?: number
          moving_avg_cost?: number | null
          name?: string
          on_hand_qty?: number
          reorder_point?: number
          sell_price?: number
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      project_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          parent_id: string | null
          project_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          project_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "project_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_events: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          kind: string
          notes: string | null
          project_id: string | null
          resource: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          project_id?: string | null
          resource?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          project_id?: string | null
          resource?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          created_at: string
          id: string
          mime: string | null
          name: string
          project_id: string
          source: string
          thumbnail: string | null
          uploaded_by: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          mime?: string | null
          name: string
          project_id: string
          source?: string
          thumbnail?: string | null
          uploaded_by?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          mime?: string | null
          name?: string
          project_id?: string
          source?: string
          thumbnail?: string | null
          uploaded_by?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_private_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          project_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_private_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_revisions: {
        Row: {
          body: string | null
          created_at: string
          id: string
          project_id: string
          requested_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          project_id: string
          requested_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          project_id?: string
          requested_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          project_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          project_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          project_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoice_items: {
        Row: {
          created_at: string
          id: string
          invoice_id: string
          product_id: string | null
          qty: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id: string
          product_id?: string | null
          qty?: number
          subtotal?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string
          product_id?: string | null
          qty?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_invoices: {
        Row: {
          brand_id: string
          card_amount: number
          cash_amount: number
          collected_amount: number
          courier_id: string | null
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          note: string | null
          occurred_at: string
          payment_method: string | null
          prep_assignee_id: string | null
          product_id: string | null
          qty: number
          sold_by: string | null
          stage: Database["public"]["Enums"]["sales_invoice_stage"]
          stage_updated_at: string
          total_amount: number
          type: Database["public"]["Enums"]["sales_invoice_type"]
          updated_at: string
        }
        Insert: {
          brand_id: string
          card_amount?: number
          cash_amount?: number
          collected_amount?: number
          courier_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          note?: string | null
          occurred_at?: string
          payment_method?: string | null
          prep_assignee_id?: string | null
          product_id?: string | null
          qty?: number
          sold_by?: string | null
          stage?: Database["public"]["Enums"]["sales_invoice_stage"]
          stage_updated_at?: string
          total_amount?: number
          type?: Database["public"]["Enums"]["sales_invoice_type"]
          updated_at?: string
        }
        Update: {
          brand_id?: string
          card_amount?: number
          cash_amount?: number
          collected_amount?: number
          courier_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          note?: string | null
          occurred_at?: string
          payment_method?: string | null
          prep_assignee_id?: string | null
          product_id?: string | null
          qty?: number
          sold_by?: string | null
          stage?: Database["public"]["Enums"]["sales_invoice_stage"]
          stage_updated_at?: string
          total_amount?: number
          type?: Database["public"]["Enums"]["sales_invoice_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_invoices_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_invoices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      service_clients: {
        Row: {
          brand_id: string
          contact: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_clients_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      service_projects: {
        Row: {
          brand_id: string
          client_id: string
          commission: number
          cost: number
          created_at: string
          deadline: string | null
          description: string | null
          finished_at: string | null
          id: string
          invoice_id: string | null
          name: string
          note: string | null
          pm_user_id: string | null
          pricing_type: string
          priority: string
          progress_pct: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          client_id: string
          commission?: number
          cost?: number
          created_at?: string
          deadline?: string | null
          description?: string | null
          finished_at?: string | null
          id?: string
          invoice_id?: string | null
          name: string
          note?: string | null
          pm_user_id?: string | null
          pricing_type?: string
          priority?: string
          progress_pct?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          client_id?: string
          commission?: number
          cost?: number
          created_at?: string
          deadline?: string | null
          description?: string | null
          finished_at?: string | null
          id?: string
          invoice_id?: string | null
          name?: string
          note?: string | null
          pm_user_id?: string | null
          pricing_type?: string
          priority?: string
          progress_pct?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_projects_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "service_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_projects_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_brands: {
        Row: {
          brand_id: string
          created_at: string
          supplier_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          supplier_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_brands_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoice_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          invoice_id: string
          kind: string
          material_id: string | null
          product_id: string | null
          qty: number
          subtotal: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id: string
          kind: string
          material_id?: string | null
          product_id?: string | null
          qty?: number
          subtotal?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          invoice_id?: string
          kind?: string
          material_id?: string | null
          product_id?: string | null
          qty?: number
          subtotal?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_invoices: {
        Row: {
          amount: number
          brand_id: string | null
          created_at: string
          due_at: string | null
          id: string
          issued_at: string
          note: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          supplier_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          brand_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          issued_at?: string
          note?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          supplier_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          brand_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          issued_at?: string
          note?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          cash_transaction_id: string | null
          created_at: string
          id: string
          invoice_id: string | null
          note: string | null
          paid_at: string
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          cash_transaction_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          paid_at?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cash_transaction_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          paid_at?: string
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_cash_transaction_id_fkey"
            columns: ["cash_transaction_id"]
            isOneToOne: false
            referencedRelation: "cash_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          brand_id: string | null
          contact: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          opening_balance: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_id?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_id?: string | null
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          brand_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          brand_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      user_brand_access: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_brand_access_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_section_access: {
        Row: {
          created_at: string
          id: string
          section: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          section: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          section?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          can_write: boolean
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_write?: boolean
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_write?: boolean
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sheet_config: {
        Row: {
          attendance_range: string | null
          created_at: string
          id: string
          spreadsheet_id: string
          spreadsheet_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attendance_range?: string | null
          created_at?: string
          id?: string
          spreadsheet_id: string
          spreadsheet_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attendance_range?: string | null
          created_at?: string
          id?: string
          spreadsheet_id?: string
          spreadsheet_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          name: string
          note: string | null
          opening_balance: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name: string
          note?: string | null
          opening_balance?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          name?: string
          note?: string | null
          opening_balance?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      __admin_exec_sql: { Args: { sql: string }; Returns: string }
      can_access_customer: {
        Args: { _customer_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_service_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      has_brand_access: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_section_access: {
        Args: { _section: string; _user_id: string }
        Returns: boolean
      }
      is_investor_of_brand: {
        Args: { _brand_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_manager: { Args: { _user_id: string }; Returns: boolean }
      is_writer: { Args: { _user_id: string }; Returns: boolean }
      map_order_to_invoice_stage: { Args: { _ff: string }; Returns: string }
      product_cogs: { Args: { _product_id: string }; Returns: number }
      products_cogs_map: {
        Args: { _ids: string[] }
        Returns: {
          cogs: number
          product_id: string
        }[]
      }
      recompute_supplier_invoice_status: {
        Args: { _invoice_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "member"
        | "manager"
        | "data_entry"
        | "viewer"
        | "education"
        | "accountant"
        | "investor"
        | "order_prep"
        | "production_manager"
        | "hr"
        | "sales_man"
        | "project_manager"
        | "operation_manager"
        | "fulfillment_manager"
        | "branch_manager"
        | "team_leader"
        | "production_worker"
        | "moderator"
        | "customer_service"
      brand_type: "product" | "service" | "offline_branch"
      cash_txn_type:
        | "collection"
        | "personal_withdrawal"
        | "deposit"
        | "other_out"
      courier_type: "courier_company" | "rep" | "offline_branch"
      employee_request_status: "pending" | "approved" | "rejected"
      employee_request_type: "leave" | "advance"
      inventory_movement_type: "production" | "sale" | "return" | "adjustment"
      invoice_status: "open" | "partial" | "paid"
      marketing_platform:
        | "tiktok"
        | "meta"
        | "google"
        | "snapchat"
        | "whatsapp"
        | "sms"
        | "other"
        | "influencer"
        | "ugc"
        | "media_production"
      sales_invoice_stage:
        | "new"
        | "processing"
        | "packing"
        | "ready_to_ship"
        | "with_courier"
        | "delivered"
        | "cancelled"
      sales_invoice_type: "sale" | "return"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "member",
        "manager",
        "data_entry",
        "viewer",
        "education",
        "accountant",
        "investor",
        "order_prep",
        "production_manager",
        "hr",
        "sales_man",
        "project_manager",
        "operation_manager",
        "fulfillment_manager",
        "branch_manager",
        "team_leader",
        "production_worker",
        "moderator",
        "customer_service",
      ],
      brand_type: ["product", "service", "offline_branch"],
      cash_txn_type: [
        "collection",
        "personal_withdrawal",
        "deposit",
        "other_out",
      ],
      courier_type: ["courier_company", "rep", "offline_branch"],
      employee_request_status: ["pending", "approved", "rejected"],
      employee_request_type: ["leave", "advance"],
      inventory_movement_type: ["production", "sale", "return", "adjustment"],
      invoice_status: ["open", "partial", "paid"],
      marketing_platform: [
        "tiktok",
        "meta",
        "google",
        "snapchat",
        "whatsapp",
        "sms",
        "other",
        "influencer",
        "ugc",
        "media_production",
      ],
      sales_invoice_stage: [
        "new",
        "processing",
        "packing",
        "ready_to_ship",
        "with_courier",
        "delivered",
        "cancelled",
      ],
      sales_invoice_type: ["sale", "return"],
    },
  },
} as const
