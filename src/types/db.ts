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
      accounts: {
        Row: {
          code: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          opening_balance: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          after: Json | null
          before: Json | null
          id: string
          occurred_at: string
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          after?: Json | null
          before?: Json | null
          id?: string
          occurred_at?: string
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          after?: Json | null
          before?: Json | null
          id?: string
          occurred_at?: string
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      batch_inputs: {
        Row: {
          batch_id: string
          cost_per_unit: number
          cost_per_unit_at_use: number | null
          created_at: string
          id: string
          ingredient_code: string
          lot_id: string | null
          notes: string | null
          qty_used: number
          subtotal: number | null
          unit: string
        }
        Insert: {
          batch_id: string
          cost_per_unit?: number
          cost_per_unit_at_use?: number | null
          created_at?: string
          id?: string
          ingredient_code: string
          lot_id?: string | null
          notes?: string | null
          qty_used: number
          subtotal?: number | null
          unit: string
        }
        Update: {
          batch_id?: string
          cost_per_unit?: number
          cost_per_unit_at_use?: number | null
          created_at?: string
          id?: string
          ingredient_code?: string
          lot_id?: string | null
          notes?: string | null
          qty_used?: number
          subtotal?: number | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_inputs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_inputs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_summary"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "batch_inputs_ingredient_code_fkey"
            columns: ["ingredient_code"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "batch_inputs_ingredient_code_fkey"
            columns: ["ingredient_code"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "batch_inputs_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "ingredient_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          batch_date: string
          brix: number | null
          cogs_total: number
          created_at: string
          deleted_at: string | null
          external_id: string | null
          finalized_at: string | null
          finalized_by_user_id: string | null
          id: string
          idempotency_key: string | null
          is_backfill: boolean
          notes: string | null
          ph: number | null
          qc_notes: string | null
          qc_passed: boolean | null
          sku_code: string
          staff_name: string | null
          staff_user_id: string | null
          status: Database["public"]["Enums"]["batch_status"]
          units_planned: number
          units_produced: number
          updated_at: string
          wastage: number
        }
        Insert: {
          batch_date?: string
          brix?: number | null
          cogs_total?: number
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          finalized_at?: string | null
          finalized_by_user_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_backfill?: boolean
          notes?: string | null
          ph?: number | null
          qc_notes?: string | null
          qc_passed?: boolean | null
          sku_code: string
          staff_name?: string | null
          staff_user_id?: string | null
          status?: Database["public"]["Enums"]["batch_status"]
          units_planned?: number
          units_produced?: number
          updated_at?: string
          wastage?: number
        }
        Update: {
          batch_date?: string
          brix?: number | null
          cogs_total?: number
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          finalized_at?: string | null
          finalized_by_user_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_backfill?: boolean
          notes?: string | null
          ph?: number | null
          qc_notes?: string | null
          qc_passed?: boolean | null
          sku_code?: string
          staff_name?: string | null
          staff_user_id?: string | null
          status?: Database["public"]["Enums"]["batch_status"]
          units_planned?: number
          units_produced?: number
          updated_at?: string
          wastage?: number
        }
        Relationships: [
          {
            foreignKeyName: "batches_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["code"]
          },
        ]
      }
      bill_receivables: {
        Row: {
          bill_id: string
          receivable_id: string
        }
        Insert: {
          bill_id: string
          receivable_id: string
        }
        Update: {
          bill_id?: string
          receivable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_receivables_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_receivables_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "receivables"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          bill_date: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          delivery_fees: number
          discount: number
          due_date: string | null
          external_id: string | null
          id: string
          idempotency_key: string | null
          issued_at: string | null
          ledger_entry_id: string | null
          notes: string | null
          paid_account_code: string | null
          paid_amount: number
          paid_date: string | null
          partner_id: string
          payment_terms: string | null
          status: Database["public"]["Enums"]["bill_status"]
          subtotal: number
          total: number
          updated_at: string
          wix_invoice_id: string | null
          wix_invoice_url: string | null
        }
        Insert: {
          bill_date?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          delivery_fees?: number
          discount?: number
          due_date?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          issued_at?: string | null
          ledger_entry_id?: string | null
          notes?: string | null
          paid_account_code?: string | null
          paid_amount?: number
          paid_date?: string | null
          partner_id: string
          payment_terms?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          wix_invoice_id?: string | null
          wix_invoice_url?: string | null
        }
        Update: {
          bill_date?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          delivery_fees?: number
          discount?: number
          due_date?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          issued_at?: string | null
          ledger_entry_id?: string | null
          notes?: string | null
          paid_account_code?: string | null
          paid_amount?: number
          paid_date?: string | null
          partner_id?: string
          payment_terms?: string | null
          status?: Database["public"]["Enums"]["bill_status"]
          subtotal?: number
          total?: number
          updated_at?: string
          wix_invoice_id?: string | null
          wix_invoice_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_paid_account_code_fkey"
            columns: ["paid_account_code"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "bills_paid_account_code_fkey"
            columns: ["paid_account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "bills_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      deduction_items: {
        Row: {
          batch_id: string | null
          created_at: string
          deduction_id: string
          id: string
          notes: string | null
          qty: number
          sku_code: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          deduction_id: string
          id?: string
          notes?: string | null
          qty: number
          sku_code: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          deduction_id?: string
          id?: string
          notes?: string | null
          qty?: number
          sku_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "deduction_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deduction_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_summary"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "deduction_items_deduction_id_fkey"
            columns: ["deduction_id"]
            isOneToOne: false
            referencedRelation: "deductions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deduction_items_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["code"]
          },
        ]
      }
      deductions: {
        Row: {
          acg_qty: number
          created_at: string
          created_by_user_id: string | null
          deduction_date: string
          deleted_at: string | null
          est_value: number
          external_id: string | null
          id: string
          notes: string | null
          pcl_qty: number
          recipient: string | null
          total_qty: number
          type: Database["public"]["Enums"]["deduction_type"]
          updated_at: string
          wpm_qty: number
        }
        Insert: {
          acg_qty?: number
          created_at?: string
          created_by_user_id?: string | null
          deduction_date?: string
          deleted_at?: string | null
          est_value?: number
          external_id?: string | null
          id?: string
          notes?: string | null
          pcl_qty?: number
          recipient?: string | null
          total_qty?: number
          type?: Database["public"]["Enums"]["deduction_type"]
          updated_at?: string
          wpm_qty?: number
        }
        Update: {
          acg_qty?: number
          created_at?: string
          created_by_user_id?: string | null
          deduction_date?: string
          deleted_at?: string | null
          est_value?: number
          external_id?: string | null
          id?: string
          notes?: string | null
          pcl_qty?: number
          recipient?: string | null
          total_qty?: number
          type?: Database["public"]["Enums"]["deduction_type"]
          updated_at?: string
          wpm_qty?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          account_code: string
          amount: number
          category: string
          created_at: string
          deleted_at: string | null
          description: string
          expense_date: string
          external_id: string | null
          id: string
          idempotency_key: string | null
          ledger_entry_id: string | null
          logged_by_name: string | null
          logged_by_user_id: string | null
          notes: string | null
          payment_ref: string | null
          receipt_url: string | null
          updated_at: string
          vendor: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by_user_id: string | null
        }
        Insert: {
          account_code: string
          amount: number
          category: string
          created_at?: string
          deleted_at?: string | null
          description: string
          expense_date?: string
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          ledger_entry_id?: string | null
          logged_by_name?: string | null
          logged_by_user_id?: string | null
          notes?: string | null
          payment_ref?: string | null
          receipt_url?: string | null
          updated_at?: string
          vendor?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Update: {
          account_code?: string
          amount?: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          description?: string
          expense_date?: string
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          ledger_entry_id?: string | null
          logged_by_name?: string | null
          logged_by_user_id?: string | null
          notes?: string | null
          payment_ref?: string | null
          receipt_url?: string | null
          updated_at?: string
          vendor?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "expenses_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "expenses_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_lots: {
        Row: {
          account_code: string
          converted_qty: number
          converted_unit: string
          cost_per_unit: number | null
          created_at: string
          deleted_at: string | null
          external_id: string | null
          id: string
          idempotency_key: string | null
          ingredient_code: string
          ledger_entry_id: string | null
          notes: string | null
          purchase_qty: number
          purchase_unit: string
          qty_remaining: number
          received_by_name: string | null
          received_by_user_id: string | null
          received_date: string
          total_cost: number
          updated_at: string
          vendor: string | null
          void_reason: string | null
          voided_by_name: string | null
          voided_by_user_id: string | null
        }
        Insert: {
          account_code: string
          converted_qty: number
          converted_unit: string
          cost_per_unit?: number | null
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          ingredient_code: string
          ledger_entry_id?: string | null
          notes?: string | null
          purchase_qty: number
          purchase_unit: string
          qty_remaining: number
          received_by_name?: string | null
          received_by_user_id?: string | null
          received_date?: string
          total_cost: number
          updated_at?: string
          vendor?: string | null
          void_reason?: string | null
          voided_by_name?: string | null
          voided_by_user_id?: string | null
        }
        Update: {
          account_code?: string
          converted_qty?: number
          converted_unit?: string
          cost_per_unit?: number | null
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          ingredient_code?: string
          ledger_entry_id?: string | null
          notes?: string | null
          purchase_qty?: number
          purchase_unit?: string
          qty_remaining?: number
          received_by_name?: string | null
          received_by_user_id?: string | null
          received_date?: string
          total_cost?: number
          updated_at?: string
          vendor?: string | null
          void_reason?: string | null
          voided_by_name?: string | null
          voided_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_lots_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ingredient_lots_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ingredient_lots_ingredient_code_fkey"
            columns: ["ingredient_code"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ingredient_lots_ingredient_code_fkey"
            columns: ["ingredient_code"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ingredient_lots_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          code: string
          cost_per_unit: number
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          type: Database["public"]["Enums"]["ingredient_type"]
          unit: string
          updated_at: string
        }
        Insert: {
          code: string
          cost_per_unit?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          type: Database["public"]["Enums"]["ingredient_type"]
          unit: string
          updated_at?: string
        }
        Update: {
          code?: string
          cost_per_unit?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          type?: Database["public"]["Enums"]["ingredient_type"]
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      integration_errors: {
        Row: {
          context: Json | null
          created_at: string
          error_message: string
          id: string
          occurred_at: string
          ref_external_id: string | null
          ref_type: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          source: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          error_message: string
          id?: string
          occurred_at?: string
          ref_external_id?: string | null
          ref_type?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          source: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          error_message?: string
          id?: string
          occurred_at?: string
          ref_external_id?: string | null
          ref_type?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          source?: string
        }
        Relationships: []
      }
      ledger_entries: {
        Row: {
          account_code: string
          amount: number
          created_at: string
          created_by_user_id: string | null
          description: string | null
          direction: Database["public"]["Enums"]["ledger_direction"]
          id: string
          idempotency_key: string | null
          occurred_at: string
          ref_external_id: string | null
          ref_id: string | null
          ref_type: string
        }
        Insert: {
          account_code: string
          amount: number
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          direction: Database["public"]["Enums"]["ledger_direction"]
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          ref_external_id?: string | null
          ref_id?: string | null
          ref_type: string
        }
        Update: {
          account_code?: string
          amount?: number
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          direction?: Database["public"]["Enums"]["ledger_direction"]
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          ref_external_id?: string | null
          ref_id?: string | null
          ref_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "ledger_entries_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["code"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          dismissed_at: string | null
          id: string
          link: string | null
          message: string | null
          occurred_at: string
          read_at: string | null
          recipient_role: Database["public"]["Enums"]["app_role"] | null
          recipient_user_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          dismissed_at?: string | null
          id?: string
          link?: string | null
          message?: string | null
          occurred_at?: string
          read_at?: string | null
          recipient_role?: Database["public"]["Enums"]["app_role"] | null
          recipient_user_id?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          dismissed_at?: string | null
          id?: string
          link?: string | null
          message?: string | null
          occurred_at?: string
          read_at?: string | null
          recipient_role?: Database["public"]["Enums"]["app_role"] | null
          recipient_user_id?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      order_item_batch_allocations: {
        Row: {
          allocated_at: string
          allocated_by_user_id: string | null
          batch_id: string
          cost_per_unit_at_delivery: number | null
          id: string
          order_item_id: string
          qty: number
        }
        Insert: {
          allocated_at?: string
          allocated_by_user_id?: string | null
          batch_id: string
          cost_per_unit_at_delivery?: number | null
          id?: string
          order_item_id: string
          qty: number
        }
        Update: {
          allocated_at?: string
          allocated_by_user_id?: string | null
          batch_id?: string
          cost_per_unit_at_delivery?: number | null
          id?: string
          order_item_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_batch_allocations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_batch_allocations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_summary"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "order_item_batch_allocations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          qty: number
          sku_code: string
          subtotal: number | null
          unit_price: number
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          qty: number
          sku_code: string
          subtotal?: number | null
          unit_price: number
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          qty?: number
          sku_code?: string
          subtotal?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_summary"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["code"]
          },
        ]
      }
      orders: {
        Row: {
          acg_qty: number
          channel: Database["public"]["Enums"]["order_channel"]
          created_at: string
          created_by_user_id: string | null
          customer_name: string | null
          deleted_at: string | null
          delivery_date: string | null
          delivery_fee: number
          discount: number
          event_name: string | null
          external_id: string | null
          fulfillment_status: Database["public"]["Enums"]["fulfillment_status"]
          id: string
          idempotency_key: string | null
          notes: string | null
          order_date: string
          override_total: number | null
          partner_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pcl_qty: number
          subtotal: number
          total: number
          updated_at: string
          wpm_qty: number
        }
        Insert: {
          acg_qty?: number
          channel: Database["public"]["Enums"]["order_channel"]
          created_at?: string
          created_by_user_id?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          delivery_fee?: number
          discount?: number
          event_name?: string | null
          external_id?: string | null
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"]
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          order_date?: string
          override_total?: number | null
          partner_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pcl_qty?: number
          subtotal?: number
          total?: number
          updated_at?: string
          wpm_qty?: number
        }
        Update: {
          acg_qty?: number
          channel?: Database["public"]["Enums"]["order_channel"]
          created_at?: string
          created_by_user_id?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          delivery_date?: string | null
          delivery_fee?: number
          discount?: number
          event_name?: string | null
          external_id?: string | null
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"]
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          order_date?: string
          override_total?: number | null
          partner_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pcl_qty?: number
          subtotal?: number
          total?: number
          updated_at?: string
          wpm_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_tiers: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          price_acg: number
          price_pcl: number
          price_wpm: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          price_acg: number
          price_pcl: number
          price_wpm: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          price_acg?: number
          price_pcl?: number
          price_wpm?: number
          updated_at?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          address: string | null
          city: string | null
          contact: string | null
          created_at: string
          deleted_at: string | null
          delivery_fee: number
          email: string | null
          external_id: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          price_acg: number | null
          price_pcl: number | null
          price_wpm: number | null
          registered_business_name: string | null
          tier_code: string
          tin: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact?: string | null
          created_at?: string
          deleted_at?: string | null
          delivery_fee?: number
          email?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          price_acg?: number | null
          price_pcl?: number | null
          price_wpm?: number | null
          registered_business_name?: string | null
          tier_code: string
          tin?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact?: string | null
          created_at?: string
          deleted_at?: string | null
          delivery_fee?: number
          email?: string | null
          external_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          price_acg?: number | null
          price_pcl?: number | null
          price_wpm?: number | null
          registered_business_name?: string | null
          tier_code?: string
          tin?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_tier_code_fkey"
            columns: ["tier_code"]
            isOneToOne: false
            referencedRelation: "partner_tiers"
            referencedColumns: ["code"]
          },
        ]
      }
      payments: {
        Row: {
          account_code: string | null
          amount: number
          approved_at: string | null
          approved_by_user_id: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by_user_id: string | null
          category: string | null
          created_at: string
          deleted_at: string | null
          external_id: string | null
          id: string
          idempotency_key: string | null
          ledger_entry_id_in: string | null
          ledger_entry_id_out: string | null
          notes: string | null
          paid_at: string | null
          paid_by_user_id: string | null
          paid_date: string | null
          payee: string | null
          purpose: string
          requested_by_name: string | null
          requested_by_user_id: string | null
          status: Database["public"]["Enums"]["payment_request_status"]
          transfer_to_account_code: string | null
          type: Database["public"]["Enums"]["payment_type"]
          updated_at: string
        }
        Insert: {
          account_code?: string | null
          amount: number
          approved_at?: string | null
          approved_by_user_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          ledger_entry_id_in?: string | null
          ledger_entry_id_out?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by_user_id?: string | null
          paid_date?: string | null
          payee?: string | null
          purpose: string
          requested_by_name?: string | null
          requested_by_user_id?: string | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          transfer_to_account_code?: string | null
          type?: Database["public"]["Enums"]["payment_type"]
          updated_at?: string
        }
        Update: {
          account_code?: string | null
          amount?: number
          approved_at?: string | null
          approved_by_user_id?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_user_id?: string | null
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          ledger_entry_id_in?: string | null
          ledger_entry_id_out?: string | null
          notes?: string | null
          paid_at?: string | null
          paid_by_user_id?: string | null
          paid_date?: string | null
          payee?: string | null
          purpose?: string
          requested_by_name?: string | null
          requested_by_user_id?: string | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          transfer_to_account_code?: string | null
          type?: Database["public"]["Enums"]["payment_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payments_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payments_ledger_entry_id_in_fkey"
            columns: ["ledger_entry_id_in"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_ledger_entry_id_out_fkey"
            columns: ["ledger_entry_id_out"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_transfer_to_account_code_fkey"
            columns: ["transfer_to_account_code"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "payments_transfer_to_account_code_fkey"
            columns: ["transfer_to_account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["code"]
          },
        ]
      }
      pos_bundles: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          emoji: string | null
          fixed_breakdown: Json | null
          id: string
          is_active: boolean
          is_flavor_pickable: boolean
          name: string
          notes: string | null
          price: number
          sort_order: number
          total_cans: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          emoji?: string | null
          fixed_breakdown?: Json | null
          id?: string
          is_active?: boolean
          is_flavor_pickable?: boolean
          name: string
          notes?: string | null
          price: number
          sort_order?: number
          total_cans: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          emoji?: string | null
          fixed_breakdown?: Json | null
          id?: string
          is_active?: boolean
          is_flavor_pickable?: boolean
          name?: string
          notes?: string | null
          price?: number
          sort_order?: number
          total_cans?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_products: {
        Row: {
          category: string
          code: string
          created_at: string
          deleted_at: string | null
          emoji: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          deleted_at?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          deleted_at?: string | null
          emoji?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_shifts: {
        Row: {
          auto_closed_reason: string | null
          closed_at: string | null
          closing_cash: number | null
          created_at: string
          default_batch_acg: string | null
          default_batch_pcl: string | null
          default_batch_wpm: string | null
          deleted_at: string | null
          event_name: string | null
          external_id: string | null
          id: string
          notes: string | null
          opened_at: string
          opened_via_pin: boolean
          opening_cash: number
          pin_entered_at: string | null
          shift_date: string
          staff_name: string | null
          staff_user_id: string | null
          updated_at: string
        }
        Insert: {
          auto_closed_reason?: string | null
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          default_batch_acg?: string | null
          default_batch_pcl?: string | null
          default_batch_wpm?: string | null
          deleted_at?: string | null
          event_name?: string | null
          external_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_via_pin?: boolean
          opening_cash?: number
          pin_entered_at?: string | null
          shift_date?: string
          staff_name?: string | null
          staff_user_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_closed_reason?: string | null
          closed_at?: string | null
          closing_cash?: number | null
          created_at?: string
          default_batch_acg?: string | null
          default_batch_pcl?: string | null
          default_batch_wpm?: string | null
          deleted_at?: string | null
          event_name?: string | null
          external_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_via_pin?: boolean
          opening_cash?: number
          pin_entered_at?: string | null
          shift_date?: string
          staff_name?: string | null
          staff_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_shifts_default_batch_acg_fkey"
            columns: ["default_batch_acg"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_default_batch_acg_fkey"
            columns: ["default_batch_acg"]
            isOneToOne: false
            referencedRelation: "inventory_summary"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "pos_shifts_default_batch_pcl_fkey"
            columns: ["default_batch_pcl"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_default_batch_pcl_fkey"
            columns: ["default_batch_pcl"]
            isOneToOne: false
            referencedRelation: "inventory_summary"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "pos_shifts_default_batch_wpm_fkey"
            columns: ["default_batch_wpm"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_shifts_default_batch_wpm_fkey"
            columns: ["default_batch_wpm"]
            isOneToOne: false
            referencedRelation: "inventory_summary"
            referencedColumns: ["batch_id"]
          },
        ]
      }
      pos_transaction_items: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          item_type: Database["public"]["Enums"]["pos_item_type"]
          label: string | null
          notes: string | null
          qty: number
          sku_code: string | null
          subtotal: number | null
          ticket_type_code: string | null
          transaction_id: string
          unit_price: number
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_type: Database["public"]["Enums"]["pos_item_type"]
          label?: string | null
          notes?: string | null
          qty: number
          sku_code?: string | null
          subtotal?: number | null
          ticket_type_code?: string | null
          transaction_id: string
          unit_price: number
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_type?: Database["public"]["Enums"]["pos_item_type"]
          label?: string | null
          notes?: string | null
          qty?: number
          sku_code?: string | null
          subtotal?: number | null
          ticket_type_code?: string | null
          transaction_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_transaction_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transaction_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_summary"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "pos_transaction_items_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "pos_transaction_items_ticket_type_code_fkey"
            columns: ["ticket_type_code"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "pos_transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_transactions: {
        Row: {
          account_code: string
          acg_qty: number
          created_at: string
          cup_lg_qty: number
          cup_sm_qty: number
          deleted_at: string | null
          discount: number
          event_name: string | null
          external_id: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          payment_method: Database["public"]["Enums"]["pos_payment_method"]
          pcl_qty: number
          shift_id: string | null
          staff_name: string | null
          staff_user_id: string | null
          subtotal: number
          ticket_qty: number
          total: number
          transaction_at: string
          updated_at: string
          water_qty: number
          wpm_qty: number
        }
        Insert: {
          account_code: string
          acg_qty?: number
          created_at?: string
          cup_lg_qty?: number
          cup_sm_qty?: number
          deleted_at?: string | null
          discount?: number
          event_name?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          payment_method: Database["public"]["Enums"]["pos_payment_method"]
          pcl_qty?: number
          shift_id?: string | null
          staff_name?: string | null
          staff_user_id?: string | null
          subtotal?: number
          ticket_qty?: number
          total?: number
          transaction_at?: string
          updated_at?: string
          water_qty?: number
          wpm_qty?: number
        }
        Update: {
          account_code?: string
          acg_qty?: number
          created_at?: string
          cup_lg_qty?: number
          cup_sm_qty?: number
          deleted_at?: string | null
          discount?: number
          event_name?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["pos_payment_method"]
          pcl_qty?: number
          shift_id?: string | null
          staff_name?: string | null
          staff_user_id?: string | null
          subtotal?: number
          ticket_qty?: number
          total?: number
          transaction_at?: string
          updated_at?: string
          water_qty?: number
          wpm_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_transactions_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "pos_transactions_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "pos_transactions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "pos_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      receivables: {
        Row: {
          amount: number
          bill_id: string | null
          created_at: string
          deleted_at: string | null
          due_date: string | null
          external_id: string | null
          id: string
          ledger_entry_id: string | null
          notes: string | null
          order_id: string
          paid_account_code: string | null
          paid_amount: number | null
          paid_date: string | null
          partner_id: string
          status: Database["public"]["Enums"]["receivable_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          bill_id?: string | null
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          external_id?: string | null
          id?: string
          ledger_entry_id?: string | null
          notes?: string | null
          order_id: string
          paid_account_code?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          partner_id: string
          status?: Database["public"]["Enums"]["receivable_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          bill_id?: string | null
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          external_id?: string | null
          id?: string
          ledger_entry_id?: string | null
          notes?: string | null
          order_id?: string
          paid_account_code?: string | null
          paid_amount?: number | null
          paid_date?: string | null
          partner_id?: string
          status?: Database["public"]["Enums"]["receivable_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_entries: {
        Row: {
          account_code: string
          amount: number
          category: Database["public"]["Enums"]["revenue_category"]
          created_at: string
          deleted_at: string | null
          description: string
          external_id: string | null
          id: string
          ledger_entry_id: string | null
          logged_by_name: string | null
          logged_by_user_id: string | null
          notes: string | null
          revenue_date: string
          updated_at: string
          void_ledger_entry_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by_name: string | null
          voided_by_user_id: string | null
        }
        Insert: {
          account_code: string
          amount: number
          category: Database["public"]["Enums"]["revenue_category"]
          created_at?: string
          deleted_at?: string | null
          description: string
          external_id?: string | null
          id?: string
          ledger_entry_id?: string | null
          logged_by_name?: string | null
          logged_by_user_id?: string | null
          notes?: string | null
          revenue_date?: string
          updated_at?: string
          void_ledger_entry_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_name?: string | null
          voided_by_user_id?: string | null
        }
        Update: {
          account_code?: string
          amount?: number
          category?: Database["public"]["Enums"]["revenue_category"]
          created_at?: string
          deleted_at?: string | null
          description?: string
          external_id?: string | null
          id?: string
          ledger_entry_id?: string | null
          logged_by_name?: string | null
          logged_by_user_id?: string | null
          notes?: string | null
          revenue_date?: string
          updated_at?: string
          void_ledger_entry_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_name?: string | null
          voided_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_entries_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "revenue_entries_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["code"]
          },
        ]
      }
      skus: {
        Row: {
          can_ingredient_code: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          retail_price: number
          short_label: string
          size_ml: number
          updated_at: string
        }
        Insert: {
          can_ingredient_code?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          retail_price: number
          short_label: string
          size_ml?: number
          updated_at?: string
        }
        Update: {
          can_ingredient_code?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          retail_price?: number
          short_label?: string
          size_ml?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skus_can_ingredient_code_fkey"
            columns: ["can_ingredient_code"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "skus_can_ingredient_code_fkey"
            columns: ["can_ingredient_code"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["code"]
          },
        ]
      }
      staff_pins: {
        Row: {
          created_at: string
          failed_attempts: number
          last_used_at: string | null
          locked_until: string | null
          pin_hash: string | null
          set_at: string | null
          set_by_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash?: string | null
          set_at?: string | null
          set_by_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash?: string | null
          set_at?: string | null
          set_by_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_state: {
        Row: {
          last_error: string | null
          last_run_at: string | null
          last_run_message: string | null
          last_run_status: string | null
          last_synced_at: string
          rows_added: number
          rows_failed: number
          rows_processed: number
          source: string
          updated_at: string
        }
        Insert: {
          last_error?: string | null
          last_run_at?: string | null
          last_run_message?: string | null
          last_run_status?: string | null
          last_synced_at?: string
          rows_added?: number
          rows_failed?: number
          rows_processed?: number
          source: string
          updated_at?: string
        }
        Update: {
          last_error?: string | null
          last_run_at?: string | null
          last_run_message?: string | null
          last_run_status?: string | null
          last_synced_at?: string
          rows_added?: number
          rows_failed?: number
          rows_processed?: number
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          allowed_account_codes: string[] | null
          created_at: string
          deleted_at: string | null
          display_name: string
          hire_date: string | null
          id: string
          notes: string | null
          phone: string | null
          photo_url: string | null
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_account_codes?: string[] | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          hire_date?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_account_codes?: string[] | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          hire_date?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          photo_url?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ticket_types: {
        Row: {
          code: string
          created_at: string
          event_category: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          price: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          event_category: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          price: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          event_category?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          buyer_email: string | null
          buyer_name: string | null
          checked_in_at: string | null
          checked_in_by_name: string | null
          checked_in_by_user_id: string | null
          created_at: string
          deleted_at: string | null
          event_date: string
          event_name: string
          external_id: string
          id: string
          notes: string | null
          order_date: string
          payment_status: Database["public"]["Enums"]["ticket_payment_status"]
          pos_item_id: string | null
          pos_transaction_id: string | null
          source: Database["public"]["Enums"]["ticket_source"]
          staff_name: string | null
          ticket_type_code: string | null
          ticket_type_name: string
          unit_price: number
          updated_at: string
          wix_event_id: string | null
          wix_order_id: string | null
          wix_ticket_number: string | null
        }
        Insert: {
          buyer_email?: string | null
          buyer_name?: string | null
          checked_in_at?: string | null
          checked_in_by_name?: string | null
          checked_in_by_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          event_date: string
          event_name: string
          external_id: string
          id?: string
          notes?: string | null
          order_date?: string
          payment_status?: Database["public"]["Enums"]["ticket_payment_status"]
          pos_item_id?: string | null
          pos_transaction_id?: string | null
          source: Database["public"]["Enums"]["ticket_source"]
          staff_name?: string | null
          ticket_type_code?: string | null
          ticket_type_name: string
          unit_price?: number
          updated_at?: string
          wix_event_id?: string | null
          wix_order_id?: string | null
          wix_ticket_number?: string | null
        }
        Update: {
          buyer_email?: string | null
          buyer_name?: string | null
          checked_in_at?: string | null
          checked_in_by_name?: string | null
          checked_in_by_user_id?: string | null
          created_at?: string
          deleted_at?: string | null
          event_date?: string
          event_name?: string
          external_id?: string
          id?: string
          notes?: string | null
          order_date?: string
          payment_status?: Database["public"]["Enums"]["ticket_payment_status"]
          pos_item_id?: string | null
          pos_transaction_id?: string | null
          source?: Database["public"]["Enums"]["ticket_source"]
          staff_name?: string | null
          ticket_type_code?: string | null
          ticket_type_name?: string
          unit_price?: number
          updated_at?: string
          wix_event_id?: string | null
          wix_order_id?: string | null
          wix_ticket_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_pos_item_id_fkey"
            columns: ["pos_item_id"]
            isOneToOne: false
            referencedRelation: "pos_transaction_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_pos_transaction_id_fkey"
            columns: ["pos_transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_ticket_type_code_fkey"
            columns: ["ticket_type_code"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["code"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wix_product_map: {
        Row: {
          cans_per_unit: number
          created_at: string
          flavor_breakdown: Json | null
          id: string
          is_active: boolean
          notes: string | null
          sku_code: string | null
          updated_at: string
          wix_product_id: string
          wix_product_name: string
        }
        Insert: {
          cans_per_unit?: number
          created_at?: string
          flavor_breakdown?: Json | null
          id?: string
          is_active?: boolean
          notes?: string | null
          sku_code?: string | null
          updated_at?: string
          wix_product_id: string
          wix_product_name: string
        }
        Update: {
          cans_per_unit?: number
          created_at?: string
          flavor_breakdown?: Json | null
          id?: string
          is_active?: boolean
          notes?: string | null
          sku_code?: string | null
          updated_at?: string
          wix_product_id?: string
          wix_product_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "wix_product_map_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          code: string | null
          current_balance: number | null
          id: string | null
          is_active: boolean | null
          last_activity_at: string | null
          name: string | null
          opening_balance: number | null
          total_in: number | null
          total_out: number | null
        }
        Relationships: []
      }
      inventory_on_hand: {
        Row: {
          active_lots: number | null
          avg_cost_per_unit: number | null
          code: string | null
          ingredient_type: string | null
          last_received_date: string | null
          name: string | null
          qty_on_hand: number | null
          unit: string | null
        }
        Relationships: []
      }
      inventory_summary: {
        Row: {
          batch_date: string | null
          batch_external_id: string | null
          batch_id: string | null
          cogs_total: number | null
          deducted: number | null
          deleted_at: string | null
          qc_passed: boolean | null
          remaining: number | null
          remaining_signed: number | null
          sku_code: string | null
          sold_via_orders: number | null
          sold_via_pos: number | null
          units_produced: number | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["code"]
          },
        ]
      }
      staff_pin_status: {
        Row: {
          display_name: string | null
          failed_attempts: number | null
          last_used_at: string | null
          locked_until: string | null
          set_at: string | null
          set_by_user_id: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      team: {
        Row: {
          created_at: string | null
          display_name: string | null
          hire_date: string | null
          notes: string | null
          phone: string | null
          photo_url: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          status: string | null
          team_member_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
      unread_notification_count: {
        Row: {
          unread_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      account_for_payment_method: {
        Args: { p_method: Database["public"]["Enums"]["pos_payment_method"] }
        Returns: string
      }
      approve_payment: {
        Args: { p_account_code: string; p_notes?: string; p_payment_id: string }
        Returns: undefined
      }
      cancel_bill: {
        Args: { p_bill_id: string; p_reason?: string }
        Returns: undefined
      }
      cancel_order: {
        Args: {
          p_idempotency_key?: string
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      cancel_payment: {
        Args: { p_payment_id: string; p_reason?: string }
        Returns: undefined
      }
      check_in_ticket: { Args: { p_ticket_id: string }; Returns: Json }
      close_expired_pin_shifts: { Args: never; Returns: number }
      close_pos_shift: {
        Args: { p_closing_cash: number; p_notes?: string; p_shift_id: string }
        Returns: Json
      }
      create_batch:
        | {
            Args: {
              p_batch_date?: string
              p_brix?: number
              p_idempotency_key: string
              p_inputs?: Json
              p_notes?: string
              p_ph?: number
              p_qc_notes?: string
              p_qc_passed?: boolean
              p_sku_code: string
              p_staff_name?: string
              p_units_planned?: number
              p_units_produced?: number
              p_wastage?: number
            }
            Returns: string
          }
        | {
            Args: {
              p_batch_date?: string
              p_brix?: number
              p_idempotency_key: string
              p_inputs?: Json
              p_is_backfill?: boolean
              p_notes?: string
              p_ph?: number
              p_qc_notes?: string
              p_qc_passed?: boolean
              p_sku_code: string
              p_staff_name?: string
              p_units_planned?: number
              p_units_produced?: number
              p_wastage?: number
            }
            Returns: string
          }
      create_bill_for_receivable: {
        Args: {
          p_bill_date?: string
          p_delivery_fees?: number
          p_discount?: number
          p_due_date?: string
          p_notes?: string
          p_payment_terms?: string
          p_receivable_id: string
        }
        Returns: string
      }
      create_draft_batch: {
        Args: {
          p_batch_date?: string
          p_idempotency_key: string
          p_inputs?: Json
          p_notes?: string
          p_sku_code: string
          p_staff_name?: string
          p_units_planned?: number
        }
        Returns: string
      }
      create_expense:
        | {
            Args: {
              p_account_code: string
              p_amount: number
              p_category: string
              p_description: string
              p_expense_date?: string
              p_idempotency_key: string
              p_logged_by_name?: string
              p_notes?: string
              p_payment_ref?: string
              p_receipt_url?: string
              p_vendor?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_account_code: string
              p_amount: number
              p_category: string
              p_description: string
              p_expense_date?: string
              p_idempotency_key: string
              p_logged_by_name?: string
              p_notes?: string
              p_override_threshold?: boolean
              p_payment_ref?: string
              p_receipt_url?: string
              p_vendor?: string
            }
            Returns: string
          }
      create_order: {
        Args: {
          p_channel: string
          p_customer_name?: string
          p_delivery_date?: string
          p_delivery_fee?: number
          p_discount?: number
          p_event_name?: string
          p_idempotency_key: string
          p_items?: Json
          p_notes?: string
          p_order_date?: string
          p_override_total?: number
          p_partner_id?: string
        }
        Returns: string
      }
      create_payment_request: {
        Args: {
          p_account_code?: string
          p_amount: number
          p_category?: string
          p_idempotency_key: string
          p_notes?: string
          p_payee?: string
          p_purpose: string
          p_requested_by_name?: string
          p_transfer_to_account_code?: string
          p_type?: string
        }
        Returns: string
      }
      create_pos_transaction: {
        Args: {
          p_account_code?: string
          p_discount?: number
          p_event_name?: string
          p_idempotency_key: string
          p_items?: Json
          p_notes?: string
          p_payment_method: string
          p_shift_id?: string
          p_staff_name?: string
          p_transaction_at?: string
        }
        Returns: string
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      deliver_order: {
        Args: { p_allocations?: Json; p_order_id: string }
        Returns: string
      }
      disable_staff_pin: { Args: { p_user_id: string }; Returns: undefined }
      discard_draft_batch: { Args: { p_batch_id: string }; Returns: undefined }
      dismiss_notification: { Args: { p_id: string }; Returns: undefined }
      edit_ingredient_lot_cosmetic: {
        Args: {
          p_lot_id: string
          p_notes?: string
          p_received_date?: string
          p_vendor?: string
        }
        Returns: undefined
      }
      finalize_batch: {
        Args: {
          p_batch_id: string
          p_brix?: number
          p_ph?: number
          p_qc_notes?: string
          p_qc_passed?: boolean
          p_units_produced: number
          p_wastage?: number
        }
        Returns: undefined
      }
      force_close_pos_shift: {
        Args: { p_closing_cash: number; p_reason?: string; p_shift_id: string }
        Returns: Json
      }
      issue_bill: { Args: { p_bill_id: string }; Returns: undefined }
      ledger_apply: {
        Args: {
          p_account_code: string
          p_amount: number
          p_description?: string
          p_direction: string
          p_idempotency_key?: string
          p_occurred_at?: string
          p_ref_external_id?: string
          p_ref_id?: string
          p_ref_type: string
        }
        Returns: string
      }
      ledger_reverse: {
        Args: { p_original_entry_id: string; p_reason?: string }
        Returns: string
      }
      log_integration_error: {
        Args: {
          p_context?: Json
          p_error_message: string
          p_ref_external_id?: string
          p_ref_type?: string
          p_source: string
        }
        Returns: string
      }
      log_revenue: {
        Args: {
          p_account_code: string
          p_amount: number
          p_category: string
          p_description: string
          p_logged_by_name?: string
          p_notes?: string
          p_revenue_date: string
        }
        Returns: string
      }
      mark_bill_paid: {
        Args: {
          p_account_code: string
          p_bill_id: string
          p_paid_amount: number
          p_paid_date?: string
        }
        Returns: string
      }
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: number }
      mark_order_paid: {
        Args: {
          p_account_code: string
          p_amount?: number
          p_order_id: string
          p_paid_date?: string
        }
        Returns: string
      }
      mark_receivable_paid_cash: {
        Args: {
          p_account_code: string
          p_amount: number
          p_paid_date?: string
          p_receivable_id: string
        }
        Returns: string
      }
      notify: {
        Args: {
          p_link?: string
          p_message?: string
          p_recipient_role?: string
          p_recipient_user_id?: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      open_pos_shift: {
        Args: {
          p_default_batch_acg?: string
          p_default_batch_pcl?: string
          p_default_batch_wpm?: string
          p_event_name: string
          p_notes?: string
          p_opening_cash?: number
          p_shift_date?: string
          p_staff_name?: string
        }
        Returns: string
      }
      partner_price_for_sku: {
        Args: { p_partner_id: string; p_sku_code: string }
        Returns: number
      }
      pay_payment: {
        Args: {
          p_account_code?: string
          p_paid_date?: string
          p_payment_id: string
        }
        Returns: undefined
      }
      receive_supplies: {
        Args: {
          p_account_code: string
          p_converted_qty: number
          p_converted_unit: string
          p_idempotency_key: string
          p_ingredient_code: string
          p_notes?: string
          p_purchase_qty: number
          p_purchase_unit: string
          p_received_by_name?: string
          p_received_date?: string
          p_total_cost: number
          p_vendor?: string
        }
        Returns: string
      }
      recompute_bill_totals: { Args: { p_bill_id: string }; Returns: undefined }
      recompute_deduction_totals: {
        Args: { p_ded_id: string }
        Returns: undefined
      }
      recompute_order_totals: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      recompute_pos_totals: { Args: { p_txn_id: string }; Returns: undefined }
      record_pin_attempt: {
        Args: { p_success: boolean; p_user_id: string }
        Returns: undefined
      }
      reset_staff_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: undefined
      }
      resolve_integration_error: {
        Args: { p_id: string; p_notes?: string }
        Returns: undefined
      }
      set_staff_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_draft_batch: {
        Args: {
          p_batch_date: string
          p_batch_id: string
          p_inputs: Json
          p_notes: string
          p_sku_code: string
          p_staff_name: string
          p_units_planned: number
        }
        Returns: undefined
      }
      user_can_use_account: {
        Args: { p_account_code: string }
        Returns: boolean
      }
      void_expense: {
        Args: { p_expense_id: string; p_reason?: string }
        Returns: string
      }
      void_ingredient_lot: {
        Args: { p_lot_id: string; p_reason?: string }
        Returns: Json
      }
      void_revenue_entry: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "ops" | "staff" | "owner" | "partner"
      batch_status: "draft" | "finalized" | "voided"
      bill_status: "draft" | "issued" | "paid" | "cancelled"
      deduction_type: "marketing" | "comps" | "wastage" | "damage" | "other"
      fulfillment_status: "Pending" | "Packed" | "Delivered" | "Cancelled"
      ingredient_type:
        | "produce"
        | "additive"
        | "water"
        | "sweetener"
        | "other"
        | "packaging"
      ledger_direction: "in" | "out"
      order_channel: "B2B" | "Retail" | "Online" | "Event"
      payment_request_status: "pending" | "approved" | "paid" | "cancelled"
      payment_status:
        | "Pending"
        | "Paid"
        | "Receivable"
        | "Billed"
        | "Partial"
        | "Cancelled"
      payment_type: "general" | "reimbursement" | "transfer"
      pos_item_type:
        | "juice"
        | "cup_sm"
        | "cup_lg"
        | "water"
        | "ticket"
        | "other"
      pos_payment_method:
        | "Cash"
        | "GCash"
        | "Bank Transfer"
        | "Xendit"
        | "Other"
      receivable_status: "pending" | "billed" | "paid" | "cancelled"
      revenue_category:
        | "catering_contract"
        | "event"
        | "sponsorship"
        | "rent"
        | "other"
      ticket_payment_status: "Paid" | "Pending" | "Refunded"
      ticket_source: "wix" | "pos" | "manual"
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
      app_role: ["admin", "manager", "ops", "staff", "owner", "partner"],
      batch_status: ["draft", "finalized", "voided"],
      bill_status: ["draft", "issued", "paid", "cancelled"],
      deduction_type: ["marketing", "comps", "wastage", "damage", "other"],
      fulfillment_status: ["Pending", "Packed", "Delivered", "Cancelled"],
      ingredient_type: [
        "produce",
        "additive",
        "water",
        "sweetener",
        "other",
        "packaging",
      ],
      ledger_direction: ["in", "out"],
      order_channel: ["B2B", "Retail", "Online", "Event"],
      payment_request_status: ["pending", "approved", "paid", "cancelled"],
      payment_status: [
        "Pending",
        "Paid",
        "Receivable",
        "Billed",
        "Partial",
        "Cancelled",
      ],
      payment_type: ["general", "reimbursement", "transfer"],
      pos_item_type: ["juice", "cup_sm", "cup_lg", "water", "ticket", "other"],
      pos_payment_method: ["Cash", "GCash", "Bank Transfer", "Xendit", "Other"],
      receivable_status: ["pending", "billed", "paid", "cancelled"],
      revenue_category: [
        "catering_contract",
        "event",
        "sponsorship",
        "rent",
        "other",
      ],
      ticket_payment_status: ["Paid", "Pending", "Refunded"],
      ticket_source: ["wix", "pos", "manual"],
    },
  },
} as const
