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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      collection_centers: {
        Row: {
          address: string | null
          code: string
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          lab_id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          lab_id: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          lab_id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_centers_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          address: string | null
          booking_type: string
          collection_center_id: string | null
          converted_by: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          lab_id: string | null
          notes: string | null
          patient_id: string | null
          phone: string
          preferred_date: string | null
          source: string
          status: string
          test_details: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          booking_type?: string
          collection_center_id?: string | null
          converted_by?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          lab_id?: string | null
          notes?: string | null
          patient_id?: string | null
          phone: string
          preferred_date?: string | null
          source?: string
          status?: string
          test_details?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          booking_type?: string
          collection_center_id?: string | null
          converted_by?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          lab_id?: string | null
          notes?: string | null
          patient_id?: string | null
          phone?: string
          preferred_date?: string | null
          source?: string
          status?: string
          test_details?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_collection_center_id_fkey"
            columns: ["collection_center_id"]
            isOneToOne: false
            referencedRelation: "collection_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          is_system_role: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_role?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_role?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      doctor_referrals: {
        Row: {
          commission_amount: number | null
          commission_paid: boolean | null
          created_at: string
          doctor_id: string
          id: string
          invoice_amount: number | null
          invoice_id: string | null
          invoice_number: string | null
          notes: string | null
          patient_id: string | null
          referral_date: string
          updated_at: string
        }
        Insert: {
          commission_amount?: number | null
          commission_paid?: boolean | null
          created_at?: string
          doctor_id: string
          id?: string
          invoice_amount?: number | null
          invoice_id?: string | null
          invoice_number?: string | null
          notes?: string | null
          patient_id?: string | null
          referral_date?: string
          updated_at?: string
        }
        Update: {
          commission_amount?: number | null
          commission_paid?: boolean | null
          created_at?: string
          doctor_id?: string
          id?: string
          invoice_amount?: number | null
          invoice_id?: string | null
          invoice_number?: string | null
          notes?: string | null
          patient_id?: string | null
          referral_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_referrals_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_referrals_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_referrals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          address: string | null
          commission_percentage: number | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          lab_id: string | null
          name: string
          notes: string | null
          phone: string | null
          specialization: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          commission_percentage?: number | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          lab_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          specialization?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          commission_percentage?: number | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          lab_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          specialization?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctors_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          department: string | null
          designation: string | null
          email: string
          employee_id: string
          full_name: string
          id: string
          is_active: boolean
          lab_id: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department?: string | null
          designation?: string | null
          email: string
          employee_id: string
          full_name: string
          id?: string
          is_active?: boolean
          lab_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string
          employee_id?: string
          full_name?: string
          id?: string
          is_active?: boolean
          lab_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_private_details: {
        Row: {
          aadhaar_number: string | null
          address: string | null
          created_at: string
          employee_id: string
          pan_number: string | null
          photo_content_type: string | null
          photo_original_name: string | null
          photo_path: string | null
          photo_size_bytes: number | null
          updated_at: string
        }
        Insert: {
          aadhaar_number?: string | null
          address?: string | null
          created_at?: string
          employee_id: string
          pan_number?: string | null
          photo_content_type?: string | null
          photo_original_name?: string | null
          photo_path?: string | null
          photo_size_bytes?: number | null
          updated_at?: string
        }
        Update: {
          aadhaar_number?: string | null
          address?: string | null
          created_at?: string
          employee_id?: string
          pan_number?: string | null
          photo_content_type?: string | null
          photo_original_name?: string | null
          photo_path?: string | null
          photo_size_bytes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_private_details_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_maintenance: {
        Row: {
          completed_date: string | null
          cost: number | null
          created_at: string
          id: string
          item_id: string
          maintenance_type: string
          notes: string | null
          performed_by: string | null
          scheduled_date: string | null
          status: string | null
          vendor: string | null
        }
        Insert: {
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          item_id: string
          maintenance_type: string
          notes?: string | null
          performed_by?: string | null
          scheduled_date?: string | null
          status?: string | null
          vendor?: string | null
        }
        Update: {
          completed_date?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          item_id?: string
          maintenance_type?: string
          notes?: string | null
          performed_by?: string | null
          scheduled_date?: string | null
          status?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_maintenance_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category_id: string | null
          created_at: string
          current_stock: number | null
          description: string | null
          id: string
          is_active: boolean | null
          lab_id: string | null
          location: string | null
          min_stock_level: number | null
          name: string
          sku: string | null
          supplier: string | null
          type: string
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          current_stock?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          lab_id?: string | null
          location?: string | null
          min_stock_level?: number | null
          name: string
          sku?: string | null
          supplier?: string | null
          type?: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          current_stock?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          lab_id?: string | null
          location?: string | null
          min_stock_level?: number | null
          name?: string
          sku?: string | null
          supplier?: string | null
          type?: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_purchases: {
        Row: {
          created_at: string
          id: string
          invoice_number: string | null
          item_id: string
          notes: string | null
          purchase_date: string
          purchased_by: string | null
          quantity: number
          supplier: string | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_number?: string | null
          item_id: string
          notes?: string | null
          purchase_date?: string
          purchased_by?: string | null
          quantity: number
          supplier?: string | null
          total_cost: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          invoice_number?: string | null
          item_id?: string
          notes?: string | null
          purchase_date?: string
          purchased_by?: string | null
          quantity?: number
          supplier?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_usage: {
        Row: {
          created_at: string
          id: string
          item_id: string
          notes: string | null
          patient_test_id: string | null
          quantity: number
          recorded_by: string | null
          total_cost: number | null
          unit_cost: number | null
          usage_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          patient_test_id?: string | null
          quantity: number
          recorded_by?: string | null
          total_cost?: number | null
          unit_cost?: number | null
          usage_date?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          patient_test_id?: string | null
          quantity?: number
          recorded_by?: string | null
          total_cost?: number | null
          unit_cost?: number | null
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_usage_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_usage_patient_test_id_fkey"
            columns: ["patient_test_id"]
            isOneToOne: false
            referencedRelation: "patient_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          discount: number | null
          id: string
          invoice_id: string
          patient_test_id: string | null
          quantity: number
          test_name: string
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          discount?: number | null
          id?: string
          invoice_id: string
          patient_test_id?: string | null
          quantity?: number
          test_name: string
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          discount?: number | null
          id?: string
          invoice_id?: string
          patient_test_id?: string | null
          quantity?: number
          test_name?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_patient_test_id_fkey"
            columns: ["patient_test_id"]
            isOneToOne: false
            referencedRelation: "patient_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          discount_amount: number | null
          final_amount: number
          id: string
          invoice_number: string
          lab_id: string | null
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          patient_id: string
          payment_method: string | null
          payment_status: string
          tax_amount: number | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          final_amount?: number
          id?: string
          invoice_number: string
          lab_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          patient_id: string
          payment_method?: string | null
          payment_status?: string
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          final_amount?: number
          id?: string
          invoice_number?: string
          lab_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          patient_id?: string
          payment_method?: string | null
          payment_status?: string
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_settings: {
        Row: {
          created_at: string
          doctor_shared: boolean | null
          id: string
          inventory_shared: boolean | null
          lab_id: string
          patient_shared: boolean | null
          settings: Json | null
          test_catalog_shared: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          doctor_shared?: boolean | null
          id?: string
          inventory_shared?: boolean | null
          lab_id: string
          patient_shared?: boolean | null
          settings?: Json | null
          test_catalog_shared?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          doctor_shared?: boolean | null
          id?: string
          inventory_shared?: boolean | null
          lab_id?: string
          patient_shared?: boolean | null
          settings?: Json | null
          test_catalog_shared?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_settings_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: true
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      lab_users: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean | null
          lab_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean | null
          lab_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean | null
          lab_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_users_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      labs: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          lab_code: string
          logo_url: string | null
          name: string
          parent_lab_id: string | null
          phone: string | null
          pincode: string | null
          settings: Json | null
          state: string | null
          type: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          lab_code: string
          logo_url?: string | null
          name: string
          parent_lab_id?: string | null
          phone?: string | null
          pincode?: string | null
          settings?: Json | null
          state?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          lab_code?: string
          logo_url?: string | null
          name?: string
          parent_lab_id?: string | null
          phone?: string | null
          pincode?: string | null
          settings?: Json | null
          state?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "labs_parent_lab_id_fkey"
            columns: ["parent_lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          attempts: number | null
          created_at: string
          expires_at: string
          id: string
          otp_hash: string
          phone: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          expires_at: string
          id?: string
          otp_hash: string
          phone: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          phone?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      patient_reminders: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          is_completed: boolean | null
          lab_id: string | null
          message: string | null
          notification_method: string | null
          notification_sent: boolean | null
          patient_id: string
          reminder_date: string
          reminder_type: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          lab_id?: string | null
          message?: string | null
          notification_method?: string | null
          notification_sent?: boolean | null
          patient_id: string
          reminder_date: string
          reminder_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          lab_id?: string | null
          message?: string | null
          notification_method?: string | null
          notification_sent?: boolean | null
          patient_id?: string
          reminder_date?: string
          reminder_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_reminders_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_reminders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_test_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_values: Json | null
          notes: string | null
          old_values: Json | null
          patient_test_id: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          notes?: string | null
          old_values?: Json | null
          patient_test_id: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          notes?: string | null
          old_values?: Json | null
          patient_test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_test_audit_patient_test_id_fkey"
            columns: ["patient_test_id"]
            isOneToOne: false
            referencedRelation: "patient_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_tests: {
        Row: {
          collected_at: string | null
          collected_by: string | null
          collection_center_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_abnormal: boolean | null
          lab_id: string | null
          normal_range_text: string | null
          notes: string | null
          patient_id: string
          performed_by: string | null
          report_url: string | null
          result: string | null
          result_entered_at: string | null
          result_entered_by: string | null
          result_unit: string | null
          result_value: number | null
          status: string
          test_date: string
          test_id: string | null
          test_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          collected_at?: string | null
          collected_by?: string | null
          collection_center_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_abnormal?: boolean | null
          lab_id?: string | null
          normal_range_text?: string | null
          notes?: string | null
          patient_id: string
          performed_by?: string | null
          report_url?: string | null
          result?: string | null
          result_entered_at?: string | null
          result_entered_by?: string | null
          result_unit?: string | null
          result_value?: number | null
          status?: string
          test_date?: string
          test_id?: string | null
          test_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          collected_at?: string | null
          collected_by?: string | null
          collection_center_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_abnormal?: boolean | null
          lab_id?: string | null
          normal_range_text?: string | null
          notes?: string | null
          patient_id?: string
          performed_by?: string | null
          report_url?: string | null
          result?: string | null
          result_entered_at?: string | null
          result_entered_by?: string | null
          result_unit?: string | null
          result_value?: number | null
          status?: string
          test_date?: string
          test_id?: string | null
          test_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_tests_collection_center_id_fkey"
            columns: ["collection_center_id"]
            isOneToOne: false
            referencedRelation: "collection_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_tests_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_tests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_tests_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_tests_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          blood_group: string | null
          collection_center_id: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          is_active: boolean
          lab_id: string | null
          patient_id: string
          phone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          blood_group?: string | null
          collection_center_id?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_active?: boolean
          lab_id?: string | null
          patient_id: string
          phone: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          blood_group?: string | null
          collection_center_id?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_active?: boolean
          lab_id?: string | null
          patient_id?: string
          phone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_collection_center_id_fkey"
            columns: ["collection_center_id"]
            isOneToOne: false
            referencedRelation: "collection_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: string
          received_by: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date?: string
          payment_method: string
          received_by?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          received_by?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quotation_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          quantity: number
          quotation_id: string
          test_name: string
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          quantity?: number
          quotation_id: string
          test_name: string
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          quantity?: number
          quotation_id?: string
          test_name?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          discount_amount: number | null
          final_amount: number
          id: string
          notes: string | null
          quotation_number: string
          status: string
          total_amount: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          discount_amount?: number | null
          final_amount?: number
          id?: string
          notes?: string | null
          quotation_number: string
          status?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number | null
          final_amount?: number
          id?: string
          notes?: string | null
          quotation_number?: string
          status?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: Database["public"]["Enums"]["permission_type"]
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: Database["public"]["Enums"]["permission_type"]
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: Database["public"]["Enums"]["permission_type"]
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_encrypted: boolean | null
          setting_key: string
          setting_type: string
          setting_value: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          setting_key: string
          setting_type?: string
          setting_value?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          setting_key?: string
          setting_type?: string
          setting_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      test_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      test_package_tests: {
        Row: {
          created_at: string
          id: string
          package_id: string
          test_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          package_id: string
          test_id: string
        }
        Update: {
          created_at?: string
          id?: string
          package_id?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_package_tests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "test_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_package_tests_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      test_packages: {
        Row: {
          created_at: string
          description: string | null
          discount_percentage: number | null
          id: string
          is_active: boolean | null
          lab_id: string | null
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          lab_id?: string | null
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_percentage?: number | null
          id?: string
          is_active?: boolean | null
          lab_id?: string | null
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_packages_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      test_templates: {
        Row: {
          created_at: string
          custom_css: string | null
          footer_template: string | null
          header_template: string | null
          id: string
          include_abnormal_flag: boolean | null
          include_normal_range: boolean | null
          include_notes: boolean | null
          is_default: boolean | null
          name: string
          result_format: string
          test_category: string | null
          test_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_css?: string | null
          footer_template?: string | null
          header_template?: string | null
          id?: string
          include_abnormal_flag?: boolean | null
          include_normal_range?: boolean | null
          include_notes?: boolean | null
          is_default?: boolean | null
          name: string
          result_format?: string
          test_category?: string | null
          test_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_css?: string | null
          footer_template?: string | null
          header_template?: string | null
          id?: string
          include_abnormal_flag?: boolean | null
          include_normal_range?: boolean | null
          include_notes?: boolean | null
          is_default?: boolean | null
          name?: string
          result_format?: string
          test_category?: string | null
          test_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_templates_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      tests: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          normal_range_max: number | null
          normal_range_min: number | null
          normal_range_text: string | null
          price: number | null
          sample_type: string | null
          test_id: string | null
          unit: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          normal_range_max?: number | null
          normal_range_min?: number | null
          normal_range_text?: string | null
          price?: number | null
          sample_type?: string | null
          test_id?: string | null
          unit?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          normal_range_max?: number | null
          normal_range_min?: number | null
          normal_range_text?: string | null
          price?: number | null
          sample_type?: string | null
          test_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "test_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_custom_roles: {
        Row: {
          created_at: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_invoice_number: { Args: never; Returns: string }
      get_user_lab_id: { Args: { _user_id: string }; Returns: string }
      get_user_permissions: {
        Args: { _user_id: string }
        Returns: {
          permission: Database["public"]["Enums"]["permission_type"]
        }[]
      }
      has_permission: {
        Args: {
          _permission: Database["public"]["Enums"]["permission_type"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_has_lab_access: {
        Args: { _lab_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "employee" | "patient" | "collector"
      permission_type:
        | "view_patients"
        | "create_patients"
        | "edit_patients"
        | "delete_patients"
        | "view_tests"
        | "create_tests"
        | "edit_tests"
        | "delete_tests"
        | "enter_test_results"
        | "view_test_results"
        | "view_billing"
        | "create_invoices"
        | "edit_invoices"
        | "delete_invoices"
        | "process_payments"
        | "view_financial_reports"
        | "view_inventory"
        | "manage_inventory"
        | "view_inventory_alerts"
        | "view_employees"
        | "create_employees"
        | "edit_employees"
        | "delete_employees"
        | "manage_roles"
        | "view_test_catalog"
        | "manage_test_catalog"
        | "view_test_packages"
        | "manage_test_packages"
        | "view_doctors"
        | "manage_doctors"
        | "view_reminders"
        | "manage_reminders"
        | "view_reports"
        | "export_reports"
        | "view_labs"
        | "manage_labs"
        | "view_collection_centers"
        | "manage_collection_centers"
        | "manage_settings"
        | "view_audit_logs"
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
      app_role: ["admin", "employee", "patient", "collector"],
      permission_type: [
        "view_patients",
        "create_patients",
        "edit_patients",
        "delete_patients",
        "view_tests",
        "create_tests",
        "edit_tests",
        "delete_tests",
        "enter_test_results",
        "view_test_results",
        "view_billing",
        "create_invoices",
        "edit_invoices",
        "delete_invoices",
        "process_payments",
        "view_financial_reports",
        "view_inventory",
        "manage_inventory",
        "view_inventory_alerts",
        "view_employees",
        "create_employees",
        "edit_employees",
        "delete_employees",
        "manage_roles",
        "view_test_catalog",
        "manage_test_catalog",
        "view_test_packages",
        "manage_test_packages",
        "view_doctors",
        "manage_doctors",
        "view_reminders",
        "manage_reminders",
        "view_reports",
        "export_reports",
        "view_labs",
        "manage_labs",
        "view_collection_centers",
        "manage_collection_centers",
        "manage_settings",
        "view_audit_logs",
      ],
    },
  },
} as const
