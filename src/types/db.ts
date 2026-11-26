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
      attendance: {
        Row: {
          clock_in_accuracy: number | null
          clock_in_at: string
          clock_in_distance_m: number | null
          clock_in_far: boolean | null
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_out_accuracy: number | null
          clock_out_at: string | null
          clock_out_lat: number | null
          clock_out_lng: number | null
          created_at: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          clock_in_accuracy?: number | null
          clock_in_at?: string
          clock_in_distance_m?: number | null
          clock_in_far?: boolean | null
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_out_accuracy?: number | null
          clock_out_at?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          created_at?: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          clock_in_accuracy?: number | null
          clock_in_at?: string
          clock_in_distance_m?: number | null
          clock_in_far?: boolean | null
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_out_accuracy?: number | null
          clock_out_at?: string | null
          clock_out_lat?: number | null
          clock_out_lng?: number | null
          created_at?: string
          id?: string
          note?: string | null
          user_id?: string
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
          dispenser_cost: number
          dispenser_ml: number
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
          qc_verified_by: string | null
          sku_code: string
          staff_name: string | null
          staff_user_id: string | null
          status: Database["public"]["Enums"]["batch_status"]
          taste_passed: boolean | null
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
          dispenser_cost?: number
          dispenser_ml?: number
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
          qc_verified_by?: string | null
          sku_code: string
          staff_name?: string | null
          staff_user_id?: string | null
          status?: Database["public"]["Enums"]["batch_status"]
          taste_passed?: boolean | null
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
          dispenser_cost?: number
          dispenser_ml?: number
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
          qc_verified_by?: string | null
          sku_code?: string
          staff_name?: string | null
          staff_user_id?: string | null
          status?: Database["public"]["Enums"]["batch_status"]
          taste_passed?: boolean | null
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
          {
            foreignKeyName: "batches_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "web_flavors"
            referencedColumns: ["code"]
          },
        ]
      }
      bill_adjustments: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          created_by_user_id: string | null
          description: string
          id: string
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string
          created_by_user_id?: string | null
          description: string
          id?: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          created_by_user_id?: string | null
          description?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_adjustments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
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
          public_token: string
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
          public_token?: string
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
          public_token?: string
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
      briefing_state: {
        Row: {
          last_shown_date: string | null
          last_visit_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          last_shown_date?: string | null
          last_visit_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          last_shown_date?: string | null
          last_visit_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_event_attendees: {
        Row: {
          created_at: string
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          created_at: string
          created_by_user_id: string
          deleted_at: string | null
          ends_at: string | null
          event_type: string
          id: string
          location: string | null
          notes: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          created_at?: string
          created_by_user_id: string
          deleted_at?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          location?: string | null
          notes?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          created_at?: string
          created_by_user_id?: string
          deleted_at?: string | null
          ends_at?: string | null
          event_type?: string
          id?: string
          location?: string | null
          notes?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cash_advance_repayments: {
        Row: {
          advance_id: string
          amount: number
          created_at: string
          id: string
          note: string | null
          payroll_item_id: string | null
          repaid_on: string
        }
        Insert: {
          advance_id: string
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          payroll_item_id?: string | null
          repaid_on?: string
        }
        Update: {
          advance_id?: string
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          payroll_item_id?: string | null
          repaid_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_advance_repayments_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "cash_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_advance_repayments_payroll_item_id_fkey"
            columns: ["payroll_item_id"]
            isOneToOne: false
            referencedRelation: "payroll_items"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_advances: {
        Row: {
          account_code: string | null
          advance_date: string
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          expense_id: string | null
          id: string
          installment: number
          name: string
          notes: string | null
          person_id: string | null
          principal: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_code?: string | null
          advance_date?: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          expense_id?: string | null
          id?: string
          installment?: number
          name: string
          notes?: string | null
          person_id?: string | null
          principal: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_code?: string | null
          advance_date?: string
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          expense_id?: string | null
          id?: string
          installment?: number
          name?: string
          notes?: string | null
          person_id?: string | null
          principal?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_advances_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "payroll_people"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          cadence: string
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          last_done_on: string | null
          position: number
          title: string
          user_id: string
          weekday: number | null
        }
        Insert: {
          cadence?: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_done_on?: string | null
          position?: number
          title: string
          user_id: string
          weekday?: number | null
        }
        Update: {
          cadence?: string
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_done_on?: string | null
          position?: number
          title?: string
          user_id?: string
          weekday?: number | null
        }
        Relationships: []
      }
      cup_specs: {
        Row: {
          cup_code: string
          juice_ml: number
          lid_code: string
          size: string
          updated_at: string
        }
        Insert: {
          cup_code: string
          juice_ml?: number
          lid_code: string
          size: string
          updated_at?: string
        }
        Update: {
          cup_code?: string
          juice_ml?: number
          lid_code?: string
          size?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cup_specs_cup_code_fkey"
            columns: ["cup_code"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "cup_specs_cup_code_fkey"
            columns: ["cup_code"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "cup_specs_lid_code_fkey"
            columns: ["lid_code"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "cup_specs_lid_code_fkey"
            columns: ["lid_code"]
            isOneToOne: false
            referencedRelation: "inventory_on_hand"
            referencedColumns: ["code"]
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
          {
            foreignKeyName: "deduction_items_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "web_flavors"
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
          idempotency_key: string | null
          notes: string | null
          pcl_qty: number
          recipient: string | null
          status: string
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
          idempotency_key?: string | null
          notes?: string | null
          pcl_qty?: number
          recipient?: string | null
          status?: string
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
          idempotency_key?: string | null
          notes?: string | null
          pcl_qty?: number
          recipient?: string | null
          status?: string
          total_qty?: number
          type?: Database["public"]["Enums"]["deduction_type"]
          updated_at?: string
          wpm_qty?: number
        }
        Relationships: []
      }
      event_sports: {
        Row: {
          capacity: number
          created_at: string
          event_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          capacity: number
          created_at?: string
          event_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          capacity?: number
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_sports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "web_events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          cover_image_url: string | null
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          description: string | null
          end_time: string | null
          event_date: string
          external_id: string | null
          id: string
          name: string
          paddle_price: number | null
          pass_price: number
          published_at: string | null
          series: string | null
          slug: string | null
          start_time: string | null
          status: string
          updated_at: string
          venue: string | null
          venue_id: string | null
        }
        Insert: {
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          description?: string | null
          end_time?: string | null
          event_date: string
          external_id?: string | null
          id?: string
          name: string
          paddle_price?: number | null
          pass_price?: number
          published_at?: string | null
          series?: string | null
          slug?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
          venue_id?: string | null
        }
        Update: {
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          description?: string | null
          end_time?: string | null
          event_date?: string
          external_id?: string | null
          id?: string
          name?: string
          paddle_price?: number | null
          pass_price?: number
          published_at?: string | null
          series?: string | null
          slug?: string | null
          start_time?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
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
          source_payroll_run_id: string | null
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
          source_payroll_run_id?: string | null
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
          source_payroll_run_id?: string | null
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
      game_matches: {
        Row: {
          block: number | null
          court: number
          finish: string | null
          finished_at: string | null
          game_no: number | null
          id: string
          is_draw: boolean
          label_a: string | null
          label_b: string | null
          outcome: string | null
          score_a: number | null
          score_b: number | null
          session_id: string
          started_at: string
          status: string
          team_a: string[]
          team_b: string[]
          winner: string | null
        }
        Insert: {
          block?: number | null
          court: number
          finish?: string | null
          finished_at?: string | null
          game_no?: number | null
          id?: string
          is_draw?: boolean
          label_a?: string | null
          label_b?: string | null
          outcome?: string | null
          score_a?: number | null
          score_b?: number | null
          session_id: string
          started_at?: string
          status?: string
          team_a: string[]
          team_b: string[]
          winner?: string | null
        }
        Update: {
          block?: number | null
          court?: number
          finish?: string | null
          finished_at?: string | null
          game_no?: number | null
          id?: string
          is_draw?: boolean
          label_a?: string | null
          label_b?: string | null
          outcome?: string | null
          score_a?: number | null
          score_b?: number | null
          session_id?: string
          started_at?: string
          status?: string
          team_a?: string[]
          team_b?: string[]
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "rr_event_player"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "game_matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "vb_event_player"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "game_matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "web_rr_event"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "game_matches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "web_vb_event"
            referencedColumns: ["session_id"]
          },
        ]
      }
      game_players: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          id: string
          rating: number
          seed_rating: number | null
          seeded_at: string | null
          skill_level: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email?: string | null
          id?: string
          rating?: number
          seed_rating?: number | null
          seeded_at?: string | null
          skill_level?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          id?: string
          rating?: number
          seed_rating?: number | null
          seeded_at?: string | null
          skill_level?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_session_players: {
        Row: {
          active: boolean
          block1_team: string | null
          block2_team: string | null
          bonus: number
          joined_at: string
          pair_no: number | null
          player_id: string
          queue_offset: number
          session_id: string
          squad: string | null
          waiting_since: string
        }
        Insert: {
          active?: boolean
          block1_team?: string | null
          block2_team?: string | null
          bonus?: number
          joined_at?: string
          pair_no?: number | null
          player_id: string
          queue_offset?: number
          session_id: string
          squad?: string | null
          waiting_since?: string
        }
        Update: {
          active?: boolean
          block1_team?: string | null
          block2_team?: string | null
          bonus?: number
          joined_at?: string
          pair_no?: number | null
          player_id?: string
          queue_offset?: number
          session_id?: string
          squad?: string | null
          waiting_since?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "rr_player_status"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "game_session_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_session_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "rr_event_player"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "game_session_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "vb_event_player"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "game_session_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "web_rr_event"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "game_session_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "web_vb_event"
            referencedColumns: ["session_id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          closed_at: string | null
          courts: number
          created_at: string
          created_by: string | null
          event_id: string | null
          finalized_at: string | null
          finalized_by: string | null
          format: string | null
          id: string
          rivalry_games: number[]
          ruleset: string
          session_date: string
          sport: string
          status: string
          target_points: number
          team_size: number
          template_id: string | null
          title: string | null
        }
        Insert: {
          closed_at?: string | null
          courts?: number
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          format?: string | null
          id?: string
          rivalry_games?: number[]
          ruleset?: string
          session_date?: string
          sport: string
          status?: string
          target_points?: number
          team_size?: number
          template_id?: string | null
          title?: string | null
        }
        Update: {
          closed_at?: string | null
          courts?: number
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          format?: string | null
          id?: string
          rivalry_games?: number[]
          ruleset?: string
          session_date?: string
          sport?: string
          status?: string
          target_points?: number
          team_size?: number
          template_id?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "web_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "game_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sport_ratings: {
        Row: {
          level: string | null
          player_id: string
          rated_count: number
          rating: number
          seed_rating: number | null
          seeded_at: string | null
          sport: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          level?: string | null
          player_id: string
          rated_count?: number
          rating: number
          seed_rating?: number | null
          seeded_at?: string | null
          sport: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          level?: string | null
          player_id?: string
          rated_count?: number
          rating?: number
          seed_rating?: number | null
          seeded_at?: string | null
          sport?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_sport_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sport_ratings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "rr_player_status"
            referencedColumns: ["player_id"]
          },
        ]
      }
      game_templates: {
        Row: {
          archived_at: string | null
          blurb: string | null
          courts: number
          created_at: string
          format: string | null
          id: string
          name: string
          ruleset: string
          sort: number
          sport: string
          team_size: number
        }
        Insert: {
          archived_at?: string | null
          blurb?: string | null
          courts?: number
          created_at?: string
          format?: string | null
          id?: string
          name: string
          ruleset?: string
          sort?: number
          sport: string
          team_size?: number
        }
        Update: {
          archived_at?: string | null
          blurb?: string | null
          courts?: number
          created_at?: string
          format?: string | null
          id?: string
          name?: string
          ruleset?: string
          sort?: number
          sport?: string
          team_size?: number
        }
        Relationships: []
      }
      hr_incidents: {
        Row: {
          created_at: string
          deleted_at: string | null
          details: string | null
          id: string
          kind: string
          logged_by_user_id: string | null
          occurred_on: string
          person_id: string | null
          severity: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          details?: string | null
          id?: string
          kind?: string
          logged_by_user_id?: string | null
          occurred_on?: string
          person_id?: string | null
          severity?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          details?: string | null
          id?: string
          kind?: string
          logged_by_user_id?: string | null
          occurred_on?: string
          person_id?: string | null
          severity?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_incidents_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "payroll_people"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_lots: {
        Row: {
          account_code: string | null
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
          account_code?: string | null
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
          account_code?: string | null
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
      member_profiles: {
        Row: {
          created_at: string
          full_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          email_enabled: boolean
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "order_items_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "web_flavors"
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
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          deleted_at: string | null
          delivery_address: string | null
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
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          payment_verification: string | null
          pcl_qty: number
          public_token: string
          received_at: string | null
          received_by_name: string | null
          subtotal: number
          total: number
          updated_at: string
          web_checkout_id: string | null
          wpm_qty: number
        }
        Insert: {
          acg_qty?: number
          channel: Database["public"]["Enums"]["order_channel"]
          created_at?: string
          created_by_user_id?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deleted_at?: string | null
          delivery_address?: string | null
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
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_verification?: string | null
          pcl_qty?: number
          public_token?: string
          received_at?: string | null
          received_by_name?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          web_checkout_id?: string | null
          wpm_qty?: number
        }
        Update: {
          acg_qty?: number
          channel?: Database["public"]["Enums"]["order_channel"]
          created_at?: string
          created_by_user_id?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          deleted_at?: string | null
          delivery_address?: string | null
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
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_verification?: string | null
          pcl_qty?: number
          public_token?: string
          received_at?: string | null
          received_by_name?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          web_checkout_id?: string | null
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
          {
            foreignKeyName: "orders_web_checkout_id_fkey"
            columns: ["web_checkout_id"]
            isOneToOne: false
            referencedRelation: "web_checkouts"
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
          pays_on_delivery: boolean
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
          pays_on_delivery?: boolean
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
          pays_on_delivery?: boolean
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
      pass_wallet: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          kind: string
          note: string | null
          ticket_id: string | null
          user_id: string
          web_checkout_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          kind: string
          note?: string | null
          ticket_id?: string | null
          user_id: string
          web_checkout_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          kind?: string
          note?: string | null
          ticket_id?: string | null
          user_id?: string
          web_checkout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pass_wallet_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pass_wallet_web_checkout_id_fkey"
            columns: ["web_checkout_id"]
            isOneToOne: false
            referencedRelation: "web_checkouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payees: {
        Row: {
          account_name: string | null
          account_number: string | null
          bank_name: string | null
          contact_number: string | null
          created_at: string
          created_by_user_id: string | null
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          normalized_name: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          contact_number?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          normalized_name?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          bank_name?: string | null
          contact_number?: string | null
          created_at?: string
          created_by_user_id?: string | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_proofs: {
        Row: {
          created_at: string
          decision: string
          declared_amount: number | null
          flags: Json
          id: string
          image_sha256: string | null
          image_url: string
          order_id: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          ticket_id: string | null
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          decision?: string
          declared_amount?: number | null
          flags?: Json
          id?: string
          image_sha256?: string | null
          image_url: string
          order_id?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          ticket_id?: string | null
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          decision?: string
          declared_amount?: number | null
          flags?: Json
          id?: string
          image_sha256?: string | null
          image_url?: string
          order_id?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          ticket_id?: string | null
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
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
          purchase_date: string | null
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
          purchase_date?: string | null
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
          purchase_date?: string | null
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
      payroll_items: {
        Row: {
          absences: number
          account_code: string | null
          adjust_note: string | null
          adjustment: number
          advance_id: string | null
          advance_repayment: number
          base_amount: number
          bonuses: number
          breakdown: Json
          created_at: string
          hours: number
          id: string
          incentive: number
          incentive_account_code: string | null
          name: string
          net_amount: number | null
          other_deductions: number
          overtime_pay: number
          pagibig: number
          pay_type: string
          payslip_emailed_at: string | null
          payslip_period_end: string | null
          payslip_period_start: string | null
          person_id: string | null
          philhealth: number
          rate: number | null
          run_id: string
          share_token: string
          sss: number
          tax: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          absences?: number
          account_code?: string | null
          adjust_note?: string | null
          adjustment?: number
          advance_id?: string | null
          advance_repayment?: number
          base_amount?: number
          bonuses?: number
          breakdown?: Json
          created_at?: string
          hours?: number
          id?: string
          incentive?: number
          incentive_account_code?: string | null
          name: string
          net_amount?: number | null
          other_deductions?: number
          overtime_pay?: number
          pagibig?: number
          pay_type?: string
          payslip_emailed_at?: string | null
          payslip_period_end?: string | null
          payslip_period_start?: string | null
          person_id?: string | null
          philhealth?: number
          rate?: number | null
          run_id: string
          share_token?: string
          sss?: number
          tax?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          absences?: number
          account_code?: string | null
          adjust_note?: string | null
          adjustment?: number
          advance_id?: string | null
          advance_repayment?: number
          base_amount?: number
          bonuses?: number
          breakdown?: Json
          created_at?: string
          hours?: number
          id?: string
          incentive?: number
          incentive_account_code?: string | null
          name?: string
          net_amount?: number | null
          other_deductions?: number
          overtime_pay?: number
          pagibig?: number
          pay_type?: string
          payslip_emailed_at?: string | null
          payslip_period_end?: string | null
          payslip_period_start?: string | null
          person_id?: string | null
          philhealth?: number
          rate?: number | null
          run_id?: string
          share_token?: string
          sss?: number
          tax?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_items_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "cash_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "payroll_people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_people: {
        Row: {
          active: boolean
          created_at: string
          default_amount: number
          default_rate: number | null
          deleted_at: string | null
          email: string | null
          hire_date: string | null
          id: string
          name: string
          notes: string | null
          pagibig_no: string | null
          pay_type: string
          philhealth_no: string | null
          phone: string | null
          sss_no: string | null
          tin_no: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_amount?: number
          default_rate?: number | null
          deleted_at?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          name: string
          notes?: string | null
          pagibig_no?: string | null
          pay_type?: string
          philhealth_no?: string | null
          phone?: string | null
          sss_no?: string | null
          tin_no?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_amount?: number
          default_rate?: number | null
          deleted_at?: string | null
          email?: string | null
          hire_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          pagibig_no?: string | null
          pay_type?: string
          philhealth_no?: string | null
          phone?: string | null
          sss_no?: string | null
          tin_no?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payroll_runs: {
        Row: {
          account_code: string | null
          approved_at: string | null
          approved_by_user_id: string | null
          created_at: string
          created_by_user_id: string | null
          expense_id: string | null
          id: string
          label: string
          notes: string | null
          pay_date: string
          period_end: string
          period_start: string
          status: string
          total_amount: number | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by_user_id: string | null
        }
        Insert: {
          account_code?: string | null
          approved_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          expense_id?: string | null
          id?: string
          label: string
          notes?: string | null
          pay_date: string
          period_end: string
          period_start: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Update: {
          account_code?: string | null
          approved_at?: string | null
          approved_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          expense_id?: string | null
          id?: string
          label?: string
          notes?: string | null
          pay_date?: string
          period_end?: string
          period_start?: string
          status?: string
          total_amount?: number | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Relationships: []
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
            foreignKeyName: "pos_transaction_items_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "web_flavors"
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
      rr_rating_ledger: {
        Row: {
          expected: number
          k: number
          match_id: string
          new_rating: number
          player_id: string
          prior: number
          result: number
          seq: number
        }
        Insert: {
          expected: number
          k: number
          match_id: string
          new_rating: number
          player_id: string
          prior: number
          result: number
          seq: number
        }
        Update: {
          expected?: number
          k?: number
          match_id?: string
          new_rating?: number
          player_id?: string
          prior?: number
          result?: number
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "rr_rating_ledger_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "game_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rr_rating_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rr_rating_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "rr_player_status"
            referencedColumns: ["player_id"]
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
      task_comments: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          active: boolean
          assigned_to_user_id: string | null
          board: string
          cadence: string
          created_at: string
          created_by_user_id: string
          day_of_month: number | null
          deleted_at: string | null
          description: string | null
          id: string
          last_created_on: string | null
          lead_days: number
          priority: string | null
          title: string
          weekday: number | null
        }
        Insert: {
          active?: boolean
          assigned_to_user_id?: string | null
          board: string
          cadence: string
          created_at?: string
          created_by_user_id: string
          day_of_month?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          last_created_on?: string | null
          lead_days?: number
          priority?: string | null
          title: string
          weekday?: number | null
        }
        Update: {
          active?: boolean
          assigned_to_user_id?: string | null
          board?: string
          cadence?: string
          created_at?: string
          created_by_user_id?: string
          day_of_month?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          last_created_on?: string | null
          lead_days?: number
          priority?: string | null
          title?: string
          weekday?: number | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          acknowledged_at: string | null
          assigned_by_user_id: string
          assigned_to_user_id: string | null
          board: string
          brand: string | null
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          due_date: string | null
          id: string
          is_private: boolean
          post_date: string | null
          priority: string | null
          proposed_caption: string | null
          remind_12h_at: string | null
          remind_24h_at: string | null
          status: string
          title: string
          updated_at: string
          work_link: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          assigned_by_user_id: string
          assigned_to_user_id?: string | null
          board: string
          brand?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_private?: boolean
          post_date?: string | null
          priority?: string | null
          proposed_caption?: string | null
          remind_12h_at?: string | null
          remind_24h_at?: string | null
          status: string
          title: string
          updated_at?: string
          work_link?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          assigned_by_user_id?: string
          assigned_to_user_id?: string | null
          board?: string
          brand?: string | null
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_private?: boolean
          post_date?: string | null
          priority?: string | null
          proposed_caption?: string | null
          remind_12h_at?: string | null
          remind_24h_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          work_link?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          account_name: string | null
          account_number: string | null
          allowed_account_codes: string[] | null
          attendance_supervisor: boolean
          bank_name: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          hide_expense_amounts: boolean
          hire_date: string | null
          id: string
          notes: string | null
          pagibig_no: string | null
          pay_rate: number | null
          pay_type: string | null
          payslip_email: string | null
          philhealth_no: string | null
          phone: string | null
          photo_url: string | null
          sss_no: string | null
          status: string
          tin_no: string | null
          title: string | null
          unpaid_break_min: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          allowed_account_codes?: string[] | null
          attendance_supervisor?: boolean
          bank_name?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          hide_expense_amounts?: boolean
          hire_date?: string | null
          id?: string
          notes?: string | null
          pagibig_no?: string | null
          pay_rate?: number | null
          pay_type?: string | null
          payslip_email?: string | null
          philhealth_no?: string | null
          phone?: string | null
          photo_url?: string | null
          sss_no?: string | null
          status?: string
          tin_no?: string | null
          title?: string | null
          unpaid_break_min?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          allowed_account_codes?: string[] | null
          attendance_supervisor?: boolean
          bank_name?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          hide_expense_amounts?: boolean
          hire_date?: string | null
          id?: string
          notes?: string | null
          pagibig_no?: string | null
          pay_rate?: number | null
          pay_type?: string | null
          payslip_email?: string | null
          philhealth_no?: string | null
          phone?: string | null
          photo_url?: string | null
          sss_no?: string | null
          status?: string
          tin_no?: string | null
          title?: string | null
          unpaid_break_min?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_allowed_users: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_active: boolean
          telegram_user_id: number
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          telegram_user_id: number
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_active?: boolean
          telegram_user_id?: number
        }
        Relationships: []
      }
      telegram_captures: {
        Row: {
          account_code: string | null
          amount: number | null
          category: string | null
          chat_id: number
          created_at: string
          expense_date: string | null
          expense_id: string | null
          extracted: Json | null
          id: string
          logged_by_name: string | null
          payment_ref: string | null
          raw_caption: string | null
          receipt_url: string | null
          status: string
          telegram_user_id: number
          updated_at: string
          vendor: string | null
        }
        Insert: {
          account_code?: string | null
          amount?: number | null
          category?: string | null
          chat_id: number
          created_at?: string
          expense_date?: string | null
          expense_id?: string | null
          extracted?: Json | null
          id?: string
          logged_by_name?: string | null
          payment_ref?: string | null
          raw_caption?: string | null
          receipt_url?: string | null
          status?: string
          telegram_user_id: number
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          account_code?: string | null
          amount?: number | null
          category?: string | null
          chat_id?: number
          created_at?: string
          expense_date?: string | null
          expense_id?: string | null
          extracted?: Json | null
          id?: string
          logged_by_name?: string | null
          payment_ref?: string | null
          raw_caption?: string | null
          receipt_url?: string | null
          status?: string
          telegram_user_id?: number
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_captures_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
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
          event_id: string | null
          event_name: string
          event_sport_id: string | null
          external_id: string
          holder_email: string | null
          holder_name: string | null
          holder_user_id: string | null
          id: string
          notes: string | null
          order_date: string
          pass_token: string | null
          payment_status: Database["public"]["Enums"]["ticket_payment_status"]
          pos_item_id: string | null
          pos_transaction_id: string | null
          source: Database["public"]["Enums"]["ticket_source"]
          staff_name: string | null
          ticket_type_code: string | null
          ticket_type_name: string
          unit_price: number
          updated_at: string
          web_checkout_id: string | null
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
          event_id?: string | null
          event_name: string
          event_sport_id?: string | null
          external_id: string
          holder_email?: string | null
          holder_name?: string | null
          holder_user_id?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          pass_token?: string | null
          payment_status?: Database["public"]["Enums"]["ticket_payment_status"]
          pos_item_id?: string | null
          pos_transaction_id?: string | null
          source: Database["public"]["Enums"]["ticket_source"]
          staff_name?: string | null
          ticket_type_code?: string | null
          ticket_type_name: string
          unit_price?: number
          updated_at?: string
          web_checkout_id?: string | null
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
          event_id?: string | null
          event_name?: string
          event_sport_id?: string | null
          external_id?: string
          holder_email?: string | null
          holder_name?: string | null
          holder_user_id?: string | null
          id?: string
          notes?: string | null
          order_date?: string
          pass_token?: string | null
          payment_status?: Database["public"]["Enums"]["ticket_payment_status"]
          pos_item_id?: string | null
          pos_transaction_id?: string | null
          source?: Database["public"]["Enums"]["ticket_source"]
          staff_name?: string | null
          ticket_type_code?: string | null
          ticket_type_name?: string
          unit_price?: number
          updated_at?: string
          web_checkout_id?: string | null
          wix_event_id?: string | null
          wix_order_id?: string | null
          wix_ticket_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "web_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_sport_id_fkey"
            columns: ["event_sport_id"]
            isOneToOne: false
            referencedRelation: "event_sports"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "tickets_web_checkout_id_fkey"
            columns: ["web_checkout_id"]
            isOneToOne: false
            referencedRelation: "web_checkouts"
            referencedColumns: ["id"]
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
      vb_rating_ledger: {
        Row: {
          expected: number
          k: number
          match_id: string
          new_rating: number
          player_id: string
          prior: number
          rated_before: number
          result: number
          seq: number
        }
        Insert: {
          expected: number
          k: number
          match_id: string
          new_rating: number
          player_id: string
          prior: number
          rated_before: number
          result: number
          seq: number
        }
        Update: {
          expected?: number
          k?: number
          match_id?: string
          new_rating?: number
          player_id?: string
          prior?: number
          rated_before?: number
          result?: number
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "vb_rating_ledger_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "game_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vb_rating_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vb_rating_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "rr_player_status"
            referencedColumns: ["player_id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          maps_url: string | null
          name: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          maps_url?: string | null
          name: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          maps_url?: string | null
          name?: string
        }
        Relationships: []
      }
      web_checkouts: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          delivery_address: string | null
          delivery_notes: string | null
          delivery_total: number
          email_error: string | null
          email_sent_at: string | null
          event_id: string | null
          first_delivery_date: string | null
          flags: Json
          id: string
          idempotency_key: string | null
          items: Json
          kind: string
          payment_method: string
          payment_verification: string
          proof_path: string | null
          proof_sha256: string | null
          public_token: string
          reference: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          subtotal: number
          total: number
          updated_at: string
          verified_account_code: string | null
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          delivery_address?: string | null
          delivery_notes?: string | null
          delivery_total: number
          email_error?: string | null
          email_sent_at?: string | null
          event_id?: string | null
          first_delivery_date?: string | null
          flags?: Json
          id?: string
          idempotency_key?: string | null
          items: Json
          kind?: string
          payment_method?: string
          payment_verification?: string
          proof_path?: string | null
          proof_sha256?: string | null
          public_token?: string
          reference: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          subtotal: number
          total: number
          updated_at?: string
          verified_account_code?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          delivery_address?: string | null
          delivery_notes?: string | null
          delivery_total?: number
          email_error?: string | null
          email_sent_at?: string | null
          event_id?: string | null
          first_delivery_date?: string | null
          flags?: Json
          id?: string
          idempotency_key?: string | null
          items?: Json
          kind?: string
          payment_method?: string
          payment_verification?: string
          proof_path?: string | null
          proof_sha256?: string | null
          public_token?: string
          reference?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          verified_account_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_checkouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_checkouts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "web_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_checkouts_verified_account_code_fkey"
            columns: ["verified_account_code"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "web_checkouts_verified_account_code_fkey"
            columns: ["verified_account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["code"]
          },
        ]
      }
      web_pass_settings: {
        Row: {
          bundle_price: number
          bundle_size: number
          id: boolean
          pass_price: number
          updated_at: string
        }
        Insert: {
          bundle_price?: number
          bundle_size?: number
          id?: boolean
          pass_price?: number
          updated_at?: string
        }
        Update: {
          bundle_price?: number
          bundle_size?: number
          id?: boolean
          pass_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      web_products: {
        Row: {
          badge: string | null
          cans_per_unit: number
          created_at: string
          deleted_at: string | null
          deliveries: number
          delivery_fee: number
          description: string | null
          id: string
          image_url: string | null
          is_published: boolean
          name: string
          price: number
          sku_code: string | null
          slug: string
          sort_order: number
          subtitle: string | null
          updated_at: string
        }
        Insert: {
          badge?: string | null
          cans_per_unit: number
          created_at?: string
          deleted_at?: string | null
          deliveries?: number
          delivery_fee?: number
          description?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          name: string
          price: number
          sku_code?: string | null
          slug: string
          sort_order?: number
          subtitle?: string | null
          updated_at?: string
        }
        Update: {
          badge?: string | null
          cans_per_unit?: number
          created_at?: string
          deleted_at?: string | null
          deliveries?: number
          delivery_fee?: number
          description?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          name?: string
          price?: number
          sku_code?: string | null
          slug?: string
          sort_order?: number
          subtitle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_products_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "web_products_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "web_flavors"
            referencedColumns: ["code"]
          },
        ]
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
          {
            foreignKeyName: "wix_product_map_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "web_flavors"
            referencedColumns: ["code"]
          },
        ]
      }
      work_sites: {
        Row: {
          active: boolean
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          radius_m: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          radius_m?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          radius_m?: number
        }
        Relationships: []
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
          {
            foreignKeyName: "batches_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "web_flavors"
            referencedColumns: ["code"]
          },
        ]
      }
      rr_event_player: {
        Row: {
          bonus: number | null
          format: string | null
          lp: number | null
          n: number | null
          pd: number | null
          player_id: string | null
          season: number | null
          session_date: string | null
          session_id: string | null
          sport: string | null
          squad: string | null
          status: string | null
          w: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "rr_player_status"
            referencedColumns: ["player_id"]
          },
        ]
      }
      rr_player_status: {
        Row: {
          finalized_events: number | null
          player_id: string | null
          provisional: boolean | null
          rating: number | null
        }
        Relationships: []
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
      vb_event_player: {
        Row: {
          d: number | null
          forfeit_l: number | null
          forfeit_w: number | null
          format: string | null
          l: number | null
          lp: number | null
          n: number | null
          pa: number | null
          pf: number | null
          player_id: string | null
          rating_after: number | null
          rating_before: number | null
          rivalry_bonus: number | null
          season: number | null
          session_date: string | null
          session_id: string | null
          sport: string | null
          status: string | null
          team_bonus: number | null
          team1: string | null
          team2: string | null
          timed: number | null
          title: string | null
          w: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "rr_player_status"
            referencedColumns: ["player_id"]
          },
        ]
      }
      web_badges: {
        Row: {
          badge: string | null
          detail: string | null
          player_id: string | null
          season: number | null
          sport: string | null
        }
        Relationships: []
      }
      web_catalog: {
        Row: {
          badge: string | null
          cans_per_unit: number | null
          deliveries: number | null
          delivery_fee: number | null
          description: string | null
          flavor_name: string | null
          id: string | null
          image_url: string | null
          name: string | null
          packs_available: number | null
          price: number | null
          sku_code: string | null
          slug: string | null
          sort_order: number | null
          subtitle: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_products_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "web_products_sku_code_fkey"
            columns: ["sku_code"]
            isOneToOne: false
            referencedRelation: "web_flavors"
            referencedColumns: ["code"]
          },
        ]
      }
      web_events: {
        Row: {
          cover_image_url: string | null
          description: string | null
          end_time: string | null
          event_date: string | null
          id: string | null
          maps_url: string | null
          name: string | null
          paddle_price: number | null
          pass_price: number | null
          series: string | null
          slug: string | null
          sports: Json | null
          start_time: string | null
          venue_address: string | null
          venue_name: string | null
        }
        Relationships: []
      }
      web_flavors: {
        Row: {
          cans_available: number | null
          code: string | null
          name: string | null
        }
        Relationships: []
      }
      web_rr_event: {
        Row: {
          bonus: number | null
          event_name: string | null
          final: boolean | null
          format: string | null
          losses: number | null
          lp: number | null
          matches: number | null
          name: string | null
          player_id: string | null
          prorated: boolean | null
          provisional: boolean | null
          rank: number | null
          rating: number | null
          season: number | null
          session_date: string | null
          session_id: string | null
          sport: string | null
          squad: string | null
          title: string | null
          win_rate: number | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "rr_player_status"
            referencedColumns: ["player_id"]
          },
        ]
      }
      web_rr_season: {
        Row: {
          eligible: boolean | null
          events: number | null
          losses: number | null
          lp: number | null
          matches: number | null
          name: string | null
          player_id: string | null
          provisional: boolean | null
          rank: number | null
          rating: number | null
          season: number | null
          sport: string | null
          win_rate: number | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "rr_player_status"
            referencedColumns: ["player_id"]
          },
        ]
      }
      web_vb_event: {
        Row: {
          bonus: number | null
          draws: number | null
          event_name: string | null
          final: boolean | null
          forfeit_l: number | null
          forfeit_w: number | null
          format: string | null
          losses: number | null
          lp: number | null
          matches: number | null
          name: string | null
          player_id: string | null
          point_diff: number | null
          points_against: number | null
          points_for: number | null
          provisional: boolean | null
          rank: number | null
          rating_after: number | null
          rating_before: number | null
          rating_change: number | null
          season: number | null
          session_date: string | null
          session_id: string | null
          sport: string | null
          team1: string | null
          team2: string | null
          timed: number | null
          win_rate: number | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "rr_player_status"
            referencedColumns: ["player_id"]
          },
        ]
      }
      web_vb_season: {
        Row: {
          draws: number | null
          events: number | null
          losses: number | null
          lp: number | null
          matches: number | null
          name: string | null
          player_id: string | null
          provisional: boolean | null
          rank: number | null
          rating: number | null
          season: number | null
          sport: string | null
          win_rate: number | null
          wins: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "game_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_session_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "rr_player_status"
            referencedColumns: ["player_id"]
          },
        ]
      }
    }
    Functions: {
      _close_pos_shift_core: {
        Args: {
          p_auto_reason?: string
          p_closing_cash: number
          p_notes?: string
          p_shift_id: string
        }
        Returns: Json
      }
      accept_delivery: {
        Args: { p_name: string; p_token: string }
        Returns: Json
      }
      account_for_payment_method: {
        Args: { p_method: Database["public"]["Enums"]["pos_payment_method"] }
        Returns: string
      }
      acknowledge_task: { Args: { p_task_id: string }; Returns: undefined }
      add_bill_adjustment: {
        Args: { p_amount: number; p_bill_id: string; p_description: string }
        Returns: string
      }
      add_checklist_item: {
        Args: { p_cadence?: string; p_title: string; p_weekday?: number }
        Returns: string
      }
      add_hr_incident: {
        Args: {
          p_details: string
          p_kind: string
          p_occurred_on: string
          p_person_id?: string
          p_severity: string
          p_title: string
          p_user_id: string
        }
        Returns: string
      }
      add_payroll_item: {
        Args: {
          p_account_code: string
          p_base_amount: number
          p_name: string
          p_run_id: string
        }
        Returns: string
      }
      add_task_comment: {
        Args: { p_body: string; p_task_id: string }
        Returns: string
      }
      adjust_resale_stock: {
        Args: { p_code: string; p_delta: number; p_reason?: string }
        Returns: undefined
      }
      allocate_dispenser_juice: {
        Args: { p_batch_id: string; p_dispenser_ml: number; p_label?: string }
        Returns: undefined
      }
      am_attendance_supervisor: { Args: never; Returns: boolean }
      apply_resale_stock_change: {
        Args: { p_change: number; p_code: string }
        Returns: undefined
      }
      approve_payment: {
        Args: {
          p_account_code: string
          p_amount?: number
          p_category?: string
          p_notes?: string
          p_payee?: string
          p_payment_id: string
          p_purchase_date?: string
          p_purpose?: string
        }
        Returns: undefined
      }
      approve_payments_bulk: {
        Args: { p_account_code?: string; p_ids: string[]; p_notes?: string }
        Returns: Json
      }
      approve_payroll_run: { Args: { p_run_id: string }; Returns: undefined }
      auto_close_stale_shifts: { Args: never; Returns: Json }
      billing_summary: { Args: never; Returns: Json }
      briefing_mark_shown: { Args: never; Returns: undefined }
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
      cash_advance_balance: { Args: { p_advance_id: string }; Returns: number }
      check_in_pass: { Args: { p_token: string }; Returns: Json }
      check_in_ticket: { Args: { p_ticket_id: string }; Returns: Json }
      check_request: { Args: never; Returns: undefined }
      clock_in: {
        Args: { p_accuracy?: number; p_lat?: number; p_lng?: number }
        Returns: string
      }
      clock_out: {
        Args: { p_accuracy?: number; p_lat?: number; p_lng?: number }
        Returns: string
      }
      close_expired_pin_shifts: { Args: never; Returns: number }
      close_pos_shift: {
        Args: { p_closing_cash: number; p_notes?: string; p_shift_id: string }
        Returns: Json
      }
      create_batch: {
        Args: {
          p_batch_date?: string
          p_brix?: number
          p_dispenser_ml?: number
          p_idempotency_key: string
          p_inputs?: Json
          p_is_backfill?: boolean
          p_notes?: string
          p_ph?: number
          p_qc_notes?: string
          p_qc_passed?: boolean
          p_qc_verified_by?: string
          p_sku_code: string
          p_staff_name?: string
          p_taste_passed?: boolean
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
      create_bill_for_receivables: {
        Args: {
          p_bill_date?: string
          p_delivery_fees?: number
          p_discount?: number
          p_due_date?: string
          p_notes?: string
          p_payment_terms?: string
          p_receivable_ids: string[]
        }
        Returns: string
      }
      create_calendar_event: {
        Args: {
          p_all_day?: boolean
          p_attendee_ids?: string[]
          p_ends_at?: string
          p_event_type: string
          p_location?: string
          p_notes?: string
          p_starts_at: string
          p_title: string
        }
        Returns: string
      }
      create_cash_advance: {
        Args: {
          p_account_code: string
          p_advance_date: string
          p_amount: number
          p_installment: number
          p_notes: string
          p_person_id: string
          p_user_id: string
        }
        Returns: string
      }
      create_deduction: {
        Args: {
          p_deduction_date?: string
          p_idempotency_key: string
          p_items?: Json
          p_notes?: string
          p_recipient?: string
          p_type: string
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
          p_purchase_date?: string
          p_purpose: string
          p_requested_by_name?: string
          p_transfer_to_account_code?: string
          p_type?: string
        }
        Returns: string
      }
      create_payroll_run: {
        Args: {
          p_label: string
          p_pay_date: string
          p_period_end: string
          p_period_start: string
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
      create_task: {
        Args: {
          p_assigned_to?: string
          p_board: string
          p_brand?: string
          p_description?: string
          p_due_date?: string
          p_is_private?: boolean
          p_post_date?: string
          p_priority?: string
          p_proposed_caption?: string
          p_title: string
          p_work_link?: string
        }
        Returns: string
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      delete_calendar_event: { Args: { p_id: string }; Returns: undefined }
      delete_checklist_item: { Args: { p_id: string }; Returns: undefined }
      delete_hr_incident: { Args: { p_id: string }; Returns: undefined }
      delete_payee: { Args: { p_id: string }; Returns: undefined }
      delete_payroll_person: { Args: { p_id: string }; Returns: undefined }
      delete_payroll_run: { Args: { p_run_id: string }; Returns: undefined }
      delete_task: { Args: { p_task_id: string }; Returns: undefined }
      delete_task_template: { Args: { p_id: string }; Returns: undefined }
      deliver_deduction: {
        Args: {
          p_allocations?: Json
          p_allow_override?: boolean
          p_deduction_id: string
        }
        Returns: string
      }
      deliver_order:
        | {
            Args: {
              p_allocations?: Json
              p_allow_override?: boolean
              p_order_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_allocations: Json
              p_allow_override: boolean
              p_delivery_date: string
              p_order_id: string
            }
            Returns: string
          }
      disable_staff_pin: { Args: { p_user_id: string }; Returns: undefined }
      discard_draft_batch: { Args: { p_batch_id: string }; Returns: undefined }
      dismiss_notification: { Args: { p_id: string }; Returns: undefined }
      edit_expense: {
        Args: {
          p_category: string
          p_description: string
          p_expense_date?: string
          p_expense_id: string
          p_notes?: string
          p_vendor?: string
        }
        Returns: undefined
      }
      edit_ingredient_lot_cosmetic: {
        Args: {
          p_lot_id: string
          p_notes?: string
          p_received_date?: string
          p_vendor?: string
        }
        Returns: undefined
      }
      event_sport_sold: { Args: { p_sport_id: string }; Returns: number }
      finalize_batch: {
        Args: {
          p_batch_id: string
          p_brix?: number
          p_dispenser_ml?: number
          p_ph?: number
          p_qc_notes?: string
          p_qc_passed?: boolean
          p_qc_verified_by?: string
          p_taste_passed?: boolean
          p_units_produced: number
          p_wastage?: number
        }
        Returns: undefined
      }
      force_close_pos_shift: {
        Args: { p_closing_cash: number; p_reason?: string; p_shift_id: string }
        Returns: Json
      }
      get_attendance_days: {
        Args: { p_end: string; p_start: string; p_user_id: string }
        Returns: {
          end_time: string
          start_time: string
          work_date: string
        }[]
      }
      get_bill_invoice: { Args: { p_token: string }; Returns: Json }
      get_daily_briefing: { Args: { p_force?: boolean }; Returns: Json }
      get_delivery_receipt: { Args: { p_token: string }; Returns: Json }
      get_notification_secrets: { Args: never; Returns: Json }
      get_payslip: { Args: { p_token: string }; Returns: Json }
      haversine_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      hide_expense_amounts_for_me: { Args: never; Returns: boolean }
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
      list_cash_advances: {
        Args: never
        Returns: {
          account_code: string
          advance_date: string
          balance: number
          id: string
          installment: number
          name: string
          notes: string
          person_id: string
          principal: number
          status: string
          user_id: string
        }[]
      }
      list_team_names: {
        Args: never
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      log_expense_from_telegram: {
        Args: {
          p_account_code: string
          p_amount: number
          p_category: string
          p_description: string
          p_expense_date?: string
          p_idempotency_key?: string
          p_logged_by_name?: string
          p_payment_ref?: string
          p_receipt_url?: string
          p_telegram_user_id: number
          p_vendor?: string
        }
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
      mark_order_paid_cod: {
        Args: {
          p_account_code: string
          p_amount?: number
          p_order_id: string
          p_paid_date?: string
        }
        Returns: string
      }
      mark_orders_paid_bulk: {
        Args: {
          p_account_code: string
          p_order_ids: string[]
          p_paid_date?: string
        }
        Returns: Json
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
      materialize_recurring_tasks: { Args: never; Returns: number }
      member_me: { Args: never; Returns: Json }
      member_save_profile: {
        Args: { p_full_name: string; p_phone: string }
        Returns: undefined
      }
      member_standings: { Args: never; Returns: Json }
      my_payslips: {
        Args: never
        Returns: {
          label: string
          net_amount: number
          pay_date: string
          period_end: string
          period_start: string
          token: string
        }[]
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
      notify_overdue_tasks: { Args: never; Returns: number }
      notify_tasks_due_soon: { Args: never; Returns: number }
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
      pad_min3: { Args: { n: number }; Returns: string }
      partner_price_for_sku: {
        Args: { p_partner_id: string; p_sku_code: string }
        Returns: number
      }
      pass_wallet_balance: { Args: { p_user: string }; Returns: number }
      pay_payment: {
        Args: {
          p_account_code?: string
          p_paid_date?: string
          p_payment_id: string
        }
        Returns: undefined
      }
      pay_payments_bulk: {
        Args: { p_account_code?: string; p_ids: string[]; p_paid_date?: string }
        Returns: Json
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
      remember_payee_account: {
        Args: {
          p_account_name?: string
          p_account_number?: string
          p_bank_name?: string
          p_contact_number?: string
          p_name: string
        }
        Returns: string
      }
      remove_bill_adjustment: { Args: { p_id: string }; Returns: undefined }
      remove_payroll_item: { Args: { p_item_id: string }; Returns: undefined }
      rename_payee: {
        Args: { p_id: string; p_name: string }
        Returns: undefined
      }
      report_attendance_monthly: {
        Args: { p_month?: string }
        Returns: {
          display_name: string
          open_shifts: number
          shifts: number
          total_minutes: number
          user_id: string
        }[]
      }
      report_cup_products: {
        Args: never
        Returns: {
          cup_cost: number
          juice_cost: number
          lid_cost: number
          month: string
          revenue: number
          size: string
          units: number
        }[]
      }
      report_monthly_breakdown: {
        Args: never
        Returns: {
          amount: number
          category: string
          flow: string
          month: string
        }[]
      }
      report_monthly_cashflow: {
        Args: never
        Returns: {
          cash_in: number
          cash_out: number
          inventory: number
          month: string
          net: number
          opex: number
          other_income: number
          other_out: number
          refunds: number
          sales: number
        }[]
      }
      report_monthly_profit: {
        Args: never
        Returns: {
          cogs: number
          gross_profit: number
          month: string
          operating_profit: number
          opex: number
          revenue: number
        }[]
      }
      reset_staff_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: undefined
      }
      resolve_integration_error: {
        Args: { p_id: string; p_notes?: string }
        Returns: undefined
      }
      restore_task: { Args: { p_task_id: string }; Returns: undefined }
      rr_cancel_session: { Args: { p_session: string }; Returns: string }
      rr_finalize_session: { Args: { p_session: string }; Returns: undefined }
      rr_is_staff: { Args: never; Returns: boolean }
      rr_level_seed: { Args: { p_level: string }; Returns: number }
      rr_public_name: { Args: { n: string }; Returns: string }
      rr_record_result: {
        Args: {
          p_finish?: string
          p_match: string
          p_score_a: number
          p_score_b: number
          p_winner: string
        }
        Returns: undefined
      }
      rr_reopen_session: { Args: { p_session: string }; Returns: undefined }
      rr_replay_ratings: { Args: never; Returns: undefined }
      rr_season_of: { Args: { d: string }; Returns: number }
      rr_valid_score:
        | { Args: { l: number; p_finish: string; w: number }; Returns: boolean }
        | {
            Args: { l: number; p_finish: string; p_target: number; w: number }
            Returns: boolean
          }
      rr_void_match: { Args: { p_match: string }; Returns: undefined }
      save_payee: {
        Args: {
          p_account_name?: string
          p_account_number?: string
          p_bank_name?: string
          p_contact_number?: string
          p_id?: string
          p_name?: string
          p_notes?: string
        }
        Returns: string
      }
      save_task_template: {
        Args: {
          p_active?: boolean
          p_assigned_to?: string
          p_board: string
          p_cadence: string
          p_day_of_month?: number
          p_description?: string
          p_id: string
          p_lead_days?: number
          p_priority?: string
          p_title: string
          p_weekday?: number
        }
        Returns: string
      }
      set_account_current_balance: {
        Args: { p_code: string; p_target: number }
        Returns: number
      }
      set_member_pay: {
        Args: {
          p_break_min?: number
          p_pay_rate: number
          p_pay_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      set_payee_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      set_payroll_advance: {
        Args: { p_advance_id: string; p_amount: number; p_item_id: string }
        Returns: undefined
      }
      set_payroll_pay_details: {
        Args: {
          p_absences: number
          p_bonuses: number
          p_incentive?: number
          p_incentive_account?: string
          p_item_id: string
          p_other: number
          p_overtime: number
          p_pagibig: number
          p_philhealth: number
          p_sss: number
          p_tax: number
        }
        Returns: undefined
      }
      set_payroll_person_profile: {
        Args: {
          p_hire_date: string
          p_id: string
          p_pagibig_no: string
          p_philhealth_no: string
          p_phone: string
          p_sss_no: string
          p_tin_no: string
          p_title: string
        }
        Returns: undefined
      }
      set_payslip_period: {
        Args: { p_end: string; p_item_id: string; p_start: string }
        Returns: undefined
      }
      set_staff_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: undefined
      }
      set_telegram_allowed_user: {
        Args: {
          p_display_name: string
          p_is_active?: boolean
          p_telegram_user_id: number
        }
        Returns: undefined
      }
      set_user_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      staff_adjust_wallet: {
        Args: { p_delta: number; p_email: string; p_note: string }
        Returns: number
      }
      staff_link_ticket_holder: {
        Args: { p_email: string; p_name: string; p_ticket: string }
        Returns: Json
      }
      team_hours_summary: {
        Args: never
        Returns: {
          last_shift: string
          month_minutes: number
          shifts: number
          total_minutes: number
          user_id: string
        }[]
      }
      team_task_stats: {
        Args: never
        Returns: {
          completed_count: number
          completed_dated: number
          ontime_count: number
          open_count: number
          overdue_open: number
          user_id: string
        }[]
      }
      toggle_checklist_item: { Args: { p_id: string }; Returns: undefined }
      update_calendar_event: {
        Args: {
          p_all_day?: boolean
          p_attendee_ids?: string[]
          p_ends_at?: string
          p_event_type: string
          p_id: string
          p_location?: string
          p_notes?: string
          p_starts_at: string
          p_title: string
        }
        Returns: undefined
      }
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
      update_payroll_item: {
        Args: {
          p_account_code: string
          p_adjust_note: string
          p_adjustment: number
          p_base_amount: number
          p_breakdown: Json
          p_hours: number
          p_item_id: string
          p_rate: number
        }
        Returns: undefined
      }
      update_task: {
        Args: {
          p_assigned_to?: string
          p_brand?: string
          p_description?: string
          p_due_date?: string
          p_post_date?: string
          p_priority?: string
          p_proposed_caption?: string
          p_task_id: string
          p_title: string
          p_work_link?: string
        }
        Returns: undefined
      }
      update_task_status: {
        Args: { p_status: string; p_task_id: string }
        Returns: undefined
      }
      upsert_payee: { Args: { p_name: string }; Returns: string }
      upsert_payroll_person: {
        Args: {
          p_active: boolean
          p_default_amount: number
          p_default_rate?: number
          p_email?: string
          p_id: string
          p_name: string
          p_pay_type: string
        }
        Returns: string
      }
      upsert_timesheet_line: {
        Args: {
          p_account_code: string
          p_base: number
          p_breakdown: Json
          p_hours: number
          p_name: string
          p_person_id: string
          p_run_id: string
          p_user_id: string
        }
        Returns: string
      }
      user_can_use_account: {
        Args: { p_account_code: string }
        Returns: boolean
      }
      user_is_principal: { Args: { p_user_id: string }; Returns: boolean }
      vb_clear_result: { Args: { p_match: string }; Returns: undefined }
      vb_finalize_session: { Args: { p_session: string }; Returns: undefined }
      vb_record_result: {
        Args: {
          p_match: string
          p_outcome: string
          p_score_a: number
          p_score_b: number
          p_winner: string
        }
        Returns: undefined
      }
      vb_replay_ratings: { Args: never; Returns: undefined }
      void_cash_advance: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      void_expense: {
        Args: { p_expense_id: string; p_reason?: string }
        Returns: string
      }
      void_ingredient_lot: {
        Args: { p_lot_id: string; p_reason?: string }
        Returns: Json
      }
      void_payroll_run: {
        Args: { p_reason: string; p_run_id: string }
        Returns: undefined
      }
      void_revenue_entry: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      web_get_checkout: { Args: { p_token: string }; Returns: Json }
      web_mark_checkout_email: {
        Args: { p_error?: string; p_token: string }
        Returns: undefined
      }
      web_pass_prices: { Args: never; Returns: Json }
      web_place_checkout: { Args: { p_payload: Json }; Returns: Json }
      web_place_pass_checkout: { Args: { p_payload: Json }; Returns: Json }
      web_review_checkout: {
        Args: {
          p_account_code?: string
          p_checkout_id: string
          p_decision: string
          p_note?: string
        }
        Returns: Json
      }
      web_stock_by_sku: {
        Args: never
        Returns: {
          cans_remaining: number
          sku_code: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "ops"
        | "staff"
        | "owner"
        | "partner"
        | "marketing"
      batch_status: "draft" | "finalized" | "voided"
      bill_status: "draft" | "issued" | "paid" | "cancelled"
      deduction_type:
        | "marketing"
        | "comps"
        | "wastage"
        | "damage"
        | "other"
        | "replacement"
      fulfillment_status:
        | "Pending"
        | "Packed"
        | "Delivered"
        | "Received"
        | "Cancelled"
      ingredient_type:
        | "produce"
        | "additive"
        | "water"
        | "sweetener"
        | "other"
        | "packaging"
        | "resale"
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
        | "csm"
        | "tbm"
        | "njf"
      ticket_payment_status: "Paid" | "Pending" | "Refunded"
      ticket_source: "wix" | "pos" | "manual" | "online"
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
    Enums: {
      app_role: [
        "admin",
        "manager",
        "ops",
        "staff",
        "owner",
        "partner",
        "marketing",
      ],
      batch_status: ["draft", "finalized", "voided"],
      bill_status: ["draft", "issued", "paid", "cancelled"],
      deduction_type: [
        "marketing",
        "comps",
        "wastage",
        "damage",
        "other",
        "replacement",
      ],
      fulfillment_status: [
        "Pending",
        "Packed",
        "Delivered",
        "Received",
        "Cancelled",
      ],
      ingredient_type: [
        "produce",
        "additive",
        "water",
        "sweetener",
        "other",
        "packaging",
        "resale",
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
        "csm",
        "tbm",
        "njf",
      ],
      ticket_payment_status: ["Paid", "Pending", "Refunded"],
      ticket_source: ["wix", "pos", "manual", "online"],
    },
  },
} as const
