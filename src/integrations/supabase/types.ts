export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      abdm_care_context_links: {
        Row: {
          abdm_request_id: string | null
          abdm_response: Json | null
          abha_address: string
          care_context_display: string
          care_context_reference: string
          created_at: string
          error_message: string | null
          hi_type: string
          id: string
          invoice_id: string | null
          lab_id: string | null
          link_attempted_at: string | null
          link_status: string
          link_token: string | null
          notify_attempted_at: string | null
          organization_id: string
          patient_id: string
          patient_test_id: string | null
          updated_at: string
        }
        Insert: {
          abdm_request_id?: string | null
          abdm_response?: Json | null
          abha_address: string
          care_context_display: string
          care_context_reference: string
          created_at?: string
          error_message?: string | null
          hi_type?: string
          id?: string
          invoice_id?: string | null
          lab_id?: string | null
          link_attempted_at?: string | null
          link_status?: string
          link_token?: string | null
          notify_attempted_at?: string | null
          organization_id: string
          patient_id: string
          patient_test_id?: string | null
          updated_at?: string
        }
        Update: {
          abdm_request_id?: string | null
          abdm_response?: Json | null
          abha_address?: string
          care_context_display?: string
          care_context_reference?: string
          created_at?: string
          error_message?: string | null
          hi_type?: string
          id?: string
          invoice_id?: string | null
          lab_id?: string | null
          link_attempted_at?: string | null
          link_status?: string
          link_token?: string | null
          notify_attempted_at?: string | null
          organization_id?: string
          patient_id?: string
          patient_test_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "abdm_care_context_links_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_care_context_links_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_care_context_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_care_context_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_care_context_links_patient_test_id_fkey"
            columns: ["patient_test_id"]
            isOneToOne: false
            referencedRelation: "patient_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      abdm_enrollment_sessions: {
        Row: {
          abha_address: string | null
          abha_number: string | null
          created_at: string
          date_of_birth: string | null
          error_message: string | null
          expires_at: string
          full_name: string | null
          gender: string | null
          id: string
          mobile: string | null
          organization_id: string
          patient_id: string | null
          status: string
          suggested_addresses: Json | null
          t_token: string | null
          txn_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          abha_address?: string | null
          abha_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          error_message?: string | null
          expires_at?: string
          full_name?: string | null
          gender?: string | null
          id?: string
          mobile?: string | null
          organization_id: string
          patient_id?: string | null
          status?: string
          suggested_addresses?: Json | null
          t_token?: string | null
          txn_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          abha_address?: string | null
          abha_number?: string | null
          created_at?: string
          date_of_birth?: string | null
          error_message?: string | null
          expires_at?: string
          full_name?: string | null
          gender?: string | null
          id?: string
          mobile?: string | null
          organization_id?: string
          patient_id?: string | null
          status?: string
          suggested_addresses?: Json | null
          t_token?: string | null
          txn_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abdm_enrollment_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_enrollment_sessions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      abdm_profile_shares: {
        Row: {
          abha_address: string | null
          abha_number: string | null
          context: string | null
          created_at: string
          hip_id: string | null
          id: string
          lab_id: string | null
          matched_patient_id: string | null
          on_share_attempted_at: string | null
          on_share_delivery_status: string
          on_share_error: string | null
          on_share_response: Json | null
          organization_id: string
          patient_date_of_birth: string | null
          patient_gender: string | null
          patient_name: string | null
          patient_phone: string | null
          patient_year_of_birth: string | null
          payload: Json
          request_id: string | null
          request_status: string
          token_expiry_seconds: number | null
          token_number: string | null
        }
        Insert: {
          abha_address?: string | null
          abha_number?: string | null
          context?: string | null
          created_at?: string
          hip_id?: string | null
          id?: string
          lab_id?: string | null
          matched_patient_id?: string | null
          on_share_attempted_at?: string | null
          on_share_delivery_status?: string
          on_share_error?: string | null
          on_share_response?: Json | null
          organization_id: string
          patient_date_of_birth?: string | null
          patient_gender?: string | null
          patient_name?: string | null
          patient_phone?: string | null
          patient_year_of_birth?: string | null
          payload: Json
          request_id?: string | null
          request_status?: string
          token_expiry_seconds?: number | null
          token_number?: string | null
        }
        Update: {
          abha_address?: string | null
          abha_number?: string | null
          context?: string | null
          created_at?: string
          hip_id?: string | null
          id?: string
          lab_id?: string | null
          matched_patient_id?: string | null
          on_share_attempted_at?: string | null
          on_share_delivery_status?: string
          on_share_error?: string | null
          on_share_response?: Json | null
          organization_id?: string
          patient_date_of_birth?: string | null
          patient_gender?: string | null
          patient_name?: string | null
          patient_phone?: string | null
          patient_year_of_birth?: string | null
          payload?: Json
          request_id?: string | null
          request_status?: string
          token_expiry_seconds?: number | null
          token_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abdm_profile_shares_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_profile_shares_matched_patient_id_fkey"
            columns: ["matched_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_profile_shares_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      abdm_running_tokens: {
        Row: {
          context: string
          created_at: string
          expires_at: string
          facility_id: string
          hip_id: string
          id: string
          lab_id: string | null
          organization_id: string
          status: string
          token_value: string
          wait_time_minutes: number
        }
        Insert: {
          context?: string
          created_at?: string
          expires_at?: string
          facility_id: string
          hip_id: string
          id?: string
          lab_id?: string | null
          organization_id: string
          status?: string
          token_value: string
          wait_time_minutes?: number
        }
        Update: {
          context?: string
          created_at?: string
          expires_at?: string
          facility_id?: string
          hip_id?: string
          id?: string
          lab_id?: string | null
          organization_id?: string
          status?: string
          token_value?: string
          wait_time_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "abdm_running_tokens_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_running_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      abdm_scan_logs: {
        Row: {
          abha_address: string | null
          abha_number: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          lab_id: string | null
          mobile: string | null
          organization_id: string
          patient_id: string | null
          request_payload: Json | null
          request_status: string
          request_type: string
          response_payload: Json | null
          user_id: string | null
        }
        Insert: {
          abha_address?: string | null
          abha_number?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          lab_id?: string | null
          mobile?: string | null
          organization_id: string
          patient_id?: string | null
          request_payload?: Json | null
          request_status: string
          request_type: string
          response_payload?: Json | null
          user_id?: string | null
        }
        Update: {
          abha_address?: string | null
          abha_number?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          lab_id?: string | null
          mobile?: string | null
          organization_id?: string
          patient_id?: string | null
          request_payload?: Json | null
          request_status?: string
          request_type?: string
          response_payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abdm_scan_logs_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_scan_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abdm_scan_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          parent_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_audit: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          entity_type: string
          id: string
          invoice_id: string
          new_values: Json | null
          notes: string | null
          old_values: Json | null
          organization_id: string | null
          payment_id: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          entity_type: string
          id?: string
          invoice_id: string
          new_values?: Json | null
          notes?: string | null
          old_values?: Json | null
          organization_id?: string | null
          payment_id?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          entity_type?: string
          id?: string
          invoice_id?: string
          new_values?: Json | null
          notes?: string | null
          old_values?: Json | null
          organization_id?: string | null
          payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_audit_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_audit_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
            foreignKeyName: "booking_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "collection_centers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_role?: boolean | null
          name: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_system_role?: boolean | null
          name?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
            foreignKeyName: "doctor_referrals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "doctors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_login_challenges: {
        Row: {
          attempts: number
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          organization_id: string | null
          otp_hash: string
          user_id: string
        }
        Insert: {
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          organization_id?: string | null
          otp_hash: string
          user_id: string
        }
        Update: {
          attempts?: number
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          organization_id?: string | null
          otp_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_login_challenges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      employee_sessions: {
        Row: {
          browser: string | null
          created_at: string
          device_name: string | null
          id: string
          ip: string | null
          last_seen_at: string
          location: string | null
          os: string | null
          revoked_at: string | null
          session_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          location?: string | null
          os?: string | null
          revoked_at?: string | null
          session_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          location?: string | null
          os?: string | null
          revoked_at?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
          organization_id: string | null
          phone: string | null
          two_factor_email_enabled: boolean
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
          organization_id?: string | null
          phone?: string | null
          two_factor_email_enabled?: boolean
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
          organization_id?: string | null
          phone?: string | null
          two_factor_email_enabled?: boolean
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
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "equipment_maintenance_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_labs: {
        Row: {
          address: string | null
          code: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_labs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "inventory_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "inventory_purchases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
            foreignKeyName: "inventory_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
            foreignKeyName: "invoice_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          collection_center_id: string | null
          created_at: string
          created_by: string | null
          discount_amount: number | null
          discount_entered_by: string | null
          final_amount: number
          id: string
          invoice_number: string
          journal_entry_id: string | null
          lab_id: string | null
          notes: string | null
          organization_id: string | null
          paid_amount: number | null
          paid_at: string | null
          patient_id: string
          payment_method: string | null
          payment_status: string
          tax_amount: number | null
          total_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          collection_center_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          discount_entered_by?: string | null
          final_amount?: number
          id?: string
          invoice_number: string
          journal_entry_id?: string | null
          lab_id?: string | null
          notes?: string | null
          organization_id?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          patient_id: string
          payment_method?: string | null
          payment_status?: string
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          collection_center_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number | null
          discount_entered_by?: string | null
          final_amount?: number
          id?: string
          invoice_number?: string
          journal_entry_id?: string | null
          lab_id?: string | null
          notes?: string | null
          organization_id?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          patient_id?: string
          payment_method?: string | null
          payment_status?: string
          tax_amount?: number | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_collection_center_id_fkey"
            columns: ["collection_center_id"]
            isOneToOne: false
            referencedRelation: "collection_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_lab_id_fkey"
            columns: ["lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      journal_entries: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          entry_date: string
          entry_number: string
          id: string
          organization_id: string
          reference: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          entry_date?: string
          entry_number: string
          id?: string
          organization_id: string
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          entry_date?: string
          entry_number?: string
          id?: string
          organization_id?: string
          reference?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          credit: number
          debit: number
          description: string | null
          id: string
          journal_entry_id: string
        }
        Insert: {
          account_id: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id: string
        }
        Update: {
          account_id?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          journal_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "lab_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean | null
          lab_id: string
          organization_id?: string | null
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean | null
          lab_id?: string
          organization_id?: string | null
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
          {
            foreignKeyName: "lab_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
            foreignKeyName: "labs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labs_parent_lab_id_fkey"
            columns: ["parent_lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          is_primary: boolean
          organization_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
          organization_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
          organization_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_domains_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_encrypted: boolean | null
          label: string
          organization_id: string
          setting_key: string
          setting_type: string
          setting_value: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          label: string
          organization_id: string
          setting_key: string
          setting_type?: string
          setting_value?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          label?: string
          organization_id?: string
          setting_key?: string
          setting_type?: string
          setting_value?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_primary: boolean
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          complimentary_note: string | null
          complimentary_until: string | null
          country_code: string
          created_at: string
          currency_code: string
          display_name: string
          favicon_url: string | null
          id: string
          is_complimentary: boolean
          legal_name: string | null
          logo_url: string | null
          metadata: Json
          payment_notes: string | null
          plan_code: string
          plan_expires_at: string | null
          primary_email: string | null
          primary_phone: string | null
          slug: string
          status: string
          theme: Json
          timezone: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          complimentary_note?: string | null
          complimentary_until?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          display_name: string
          favicon_url?: string | null
          id?: string
          is_complimentary?: boolean
          legal_name?: string | null
          logo_url?: string | null
          metadata?: Json
          payment_notes?: string | null
          plan_code?: string
          plan_expires_at?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          slug: string
          status?: string
          theme?: Json
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          complimentary_note?: string | null
          complimentary_until?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          display_name?: string
          favicon_url?: string | null
          id?: string
          is_complimentary?: boolean
          legal_name?: string | null
          logo_url?: string | null
          metadata?: Json
          payment_notes?: string | null
          plan_code?: string
          plan_expires_at?: string | null
          primary_email?: string | null
          primary_phone?: string | null
          slug?: string
          status?: string
          theme?: Json
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      otp_codes: {
        Row: {
          attempts: number | null
          created_at: string
          expires_at: string
          id: string
          organization_id: string | null
          otp_hash: string
          phone: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          expires_at: string
          id?: string
          organization_id?: string | null
          otp_hash: string
          phone: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string | null
          otp_hash?: string
          phone?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "otp_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_password_resets: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          patient_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          patient_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          patient_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_password_resets_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
            foreignKeyName: "patient_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      patient_sessions: {
        Row: {
          browser: string | null
          created_at: string
          device_name: string | null
          id: string
          ip: string | null
          last_seen_at: string
          location: string | null
          os: string | null
          revoked_at: string | null
          session_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          location?: string | null
          os?: string | null
          revoked_at?: string | null
          session_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_name?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          location?: string | null
          os?: string | null
          revoked_at?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
          external_lab_id: string | null
          id: string
          is_abnormal: boolean | null
          lab_id: string | null
          normal_range_text: string | null
          notes: string | null
          organization_id: string | null
          outsource_cost: number | null
          outsource_journal_entry_id: string | null
          outsourced_at: string | null
          outsourced_by: string | null
          patient_id: string
          performed_by: string | null
          registry_serial: string | null
          report_url: string | null
          result: string | null
          result_entered_at: string | null
          result_entered_by: string | null
          result_items: Json | null
          result_unit: string | null
          result_value: number | null
          status: string
          test_date: string
          test_id: string | null
          test_name: string
          test_package_group_id: string | null
          test_package_id: string | null
          test_package_name: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          collected_at?: string | null
          collected_by?: string | null
          collection_center_id?: string | null
          created_at?: string
          created_by?: string | null
          external_lab_id?: string | null
          id?: string
          is_abnormal?: boolean | null
          lab_id?: string | null
          normal_range_text?: string | null
          notes?: string | null
          organization_id?: string | null
          outsource_cost?: number | null
          outsource_journal_entry_id?: string | null
          outsourced_at?: string | null
          outsourced_by?: string | null
          patient_id: string
          performed_by?: string | null
          registry_serial?: string | null
          report_url?: string | null
          result?: string | null
          result_entered_at?: string | null
          result_entered_by?: string | null
          result_items?: Json | null
          result_unit?: string | null
          result_value?: number | null
          status?: string
          test_date?: string
          test_id?: string | null
          test_name: string
          test_package_group_id?: string | null
          test_package_id?: string | null
          test_package_name?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          collected_at?: string | null
          collected_by?: string | null
          collection_center_id?: string | null
          created_at?: string
          created_by?: string | null
          external_lab_id?: string | null
          id?: string
          is_abnormal?: boolean | null
          lab_id?: string | null
          normal_range_text?: string | null
          notes?: string | null
          organization_id?: string | null
          outsource_cost?: number | null
          outsource_journal_entry_id?: string | null
          outsourced_at?: string | null
          outsourced_by?: string | null
          patient_id?: string
          performed_by?: string | null
          registry_serial?: string | null
          report_url?: string | null
          result?: string | null
          result_entered_at?: string | null
          result_entered_by?: string | null
          result_items?: Json | null
          result_unit?: string | null
          result_value?: number | null
          status?: string
          test_date?: string
          test_id?: string | null
          test_name?: string
          test_package_group_id?: string | null
          test_package_id?: string | null
          test_package_name?: string | null
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
            foreignKeyName: "patient_tests_external_lab_id_fkey"
            columns: ["external_lab_id"]
            isOneToOne: false
            referencedRelation: "external_labs"
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
            foreignKeyName: "patient_tests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_tests_outsource_journal_entry_id_fkey"
            columns: ["outsource_journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
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
          {
            foreignKeyName: "patient_tests_test_package_id_fkey"
            columns: ["test_package_id"]
            isOneToOne: false
            referencedRelation: "test_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          abdm_last_verified_at: string | null
          abdm_link_status: string | null
          abdm_linked_at: string | null
          abdm_source: string | null
          abha_address: string | null
          abha_number: string | null
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
          last_password_change: string | null
          organization_id: string | null
          password_hash: string | null
          password_reset_required: boolean
          patient_id: string
          phone: string
          updated_at: string
          user_id: string | null
          username: string | null
        }
        Insert: {
          abdm_last_verified_at?: string | null
          abdm_link_status?: string | null
          abdm_linked_at?: string | null
          abdm_source?: string | null
          abha_address?: string | null
          abha_number?: string | null
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
          last_password_change?: string | null
          organization_id?: string | null
          password_hash?: string | null
          password_reset_required?: boolean
          patient_id: string
          phone: string
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Update: {
          abdm_last_verified_at?: string | null
          abdm_link_status?: string | null
          abdm_linked_at?: string | null
          abdm_source?: string | null
          abha_address?: string | null
          abha_number?: string | null
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
          last_password_change?: string | null
          organization_id?: string | null
          password_hash?: string | null
          password_reset_required?: boolean
          patient_id?: string
          phone?: string
          updated_at?: string
          user_id?: string | null
          username?: string | null
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
          {
            foreignKeyName: "patients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          journal_entry_id: string | null
          notes: string | null
          organization_id: string | null
          payment_date: string
          payment_gateway: string | null
          payment_method: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          received_by: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string | null
          payment_date?: string
          payment_gateway?: string | null
          payment_method: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          received_by?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          journal_entry_id?: string | null
          notes?: string | null
          organization_id?: string | null
          payment_date?: string
          payment_gateway?: string | null
          payment_method?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
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
          {
            foreignKeyName: "payments_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      platform_coupon_codes: {
        Row: {
          applicable_plans: string[] | null
          code: string
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          note: string | null
          uses_count: number
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          applicable_plans?: string[] | null
          code: string
          created_at?: string
          created_by?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          note?: string | null
          uses_count?: number
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          applicable_plans?: string[] | null
          code?: string
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          note?: string | null
          uses_count?: number
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      platform_demo_requests: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          branch_count: number | null
          city: string | null
          closed_at: string | null
          contacted_at: string | null
          created_at: string
          email: string
          fbclid: string | null
          full_name: string
          gclid: string | null
          hostname: string | null
          id: string
          lab_name: string
          next_follow_up_at: string | null
          notes: string | null
          page_path: string | null
          phone: string
          qualified_at: string | null
          referer: string | null
          source: string
          status: string
          status_notes: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          branch_count?: number | null
          city?: string | null
          closed_at?: string | null
          contacted_at?: string | null
          created_at?: string
          email: string
          fbclid?: string | null
          full_name: string
          gclid?: string | null
          hostname?: string | null
          id?: string
          lab_name: string
          next_follow_up_at?: string | null
          notes?: string | null
          page_path?: string | null
          phone: string
          qualified_at?: string | null
          referer?: string | null
          source?: string
          status?: string
          status_notes?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          branch_count?: number | null
          city?: string | null
          closed_at?: string | null
          contacted_at?: string | null
          created_at?: string
          email?: string
          fbclid?: string | null
          full_name?: string
          gclid?: string | null
          hostname?: string | null
          id?: string
          lab_name?: string
          next_follow_up_at?: string | null
          notes?: string | null
          page_path?: string | null
          phone?: string
          qualified_at?: string | null
          referer?: string | null
          source?: string
          status?: string
          status_notes?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      platform_notifications: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      platform_onboarding_requests: {
        Row: {
          approved_at: string | null
          assigned_at: string | null
          assigned_to: string | null
          branch_count: number
          city: string | null
          closed_at: string | null
          coupon_code: string | null
          created_at: string
          custom_domain: string | null
          fbclid: string | null
          gclid: string | null
          go_live_target: string | null
          hostname: string | null
          id: string
          needs_data_import: boolean
          needs_white_label: boolean
          next_follow_up_at: string | null
          notes: string | null
          organization_name: string
          owner_email: string
          owner_full_name: string
          owner_phone: string
          page_path: string | null
          preferred_subdomain: string | null
          primary_lab_name: string | null
          provisioned_at: string | null
          provisioned_by: string | null
          provisioned_lab_id: string | null
          provisioned_organization_id: string | null
          provisioned_owner_user_id: string | null
          provisioning_error: string | null
          referer: string | null
          resolved_access_domain: string | null
          resolved_domain: string | null
          resolved_slug: string | null
          reviewing_at: string | null
          selected_plan: string
          setup_mode: string
          status: string
          status_notes: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          approved_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          branch_count?: number
          city?: string | null
          closed_at?: string | null
          coupon_code?: string | null
          created_at?: string
          custom_domain?: string | null
          fbclid?: string | null
          gclid?: string | null
          go_live_target?: string | null
          hostname?: string | null
          id?: string
          needs_data_import?: boolean
          needs_white_label?: boolean
          next_follow_up_at?: string | null
          notes?: string | null
          organization_name: string
          owner_email: string
          owner_full_name: string
          owner_phone: string
          page_path?: string | null
          preferred_subdomain?: string | null
          primary_lab_name?: string | null
          provisioned_at?: string | null
          provisioned_by?: string | null
          provisioned_lab_id?: string | null
          provisioned_organization_id?: string | null
          provisioned_owner_user_id?: string | null
          provisioning_error?: string | null
          referer?: string | null
          resolved_access_domain?: string | null
          resolved_domain?: string | null
          resolved_slug?: string | null
          reviewing_at?: string | null
          selected_plan: string
          setup_mode: string
          status?: string
          status_notes?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          approved_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          branch_count?: number
          city?: string | null
          closed_at?: string | null
          coupon_code?: string | null
          created_at?: string
          custom_domain?: string | null
          fbclid?: string | null
          gclid?: string | null
          go_live_target?: string | null
          hostname?: string | null
          id?: string
          needs_data_import?: boolean
          needs_white_label?: boolean
          next_follow_up_at?: string | null
          notes?: string | null
          organization_name?: string
          owner_email?: string
          owner_full_name?: string
          owner_phone?: string
          page_path?: string | null
          preferred_subdomain?: string | null
          primary_lab_name?: string | null
          provisioned_at?: string | null
          provisioned_by?: string | null
          provisioned_lab_id?: string | null
          provisioned_organization_id?: string | null
          provisioned_owner_user_id?: string | null
          provisioning_error?: string | null
          referer?: string | null
          resolved_access_domain?: string | null
          resolved_domain?: string | null
          resolved_slug?: string | null
          reviewing_at?: string | null
          selected_plan?: string
          setup_mode?: string
          status?: string
          status_notes?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_onboarding_requests_provisioned_lab_id_fkey"
            columns: ["provisioned_lab_id"]
            isOneToOne: false
            referencedRelation: "labs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_onboarding_requests_provisioned_organization_id_fkey"
            columns: ["provisioned_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
          quantity: number
          quotation_id: string
          test_name: string
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          organization_id?: string | null
          quantity?: number
          quotation_id: string
          test_name: string
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          organization_id?: string | null
          quantity?: number
          quotation_id?: string
          test_name?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          quotation_number?: string
          status?: string
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          label: string
          setting_key: string
          setting_type: string
          setting_value: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          label: string
          setting_key: string
          setting_type?: string
          setting_value?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_encrypted?: boolean | null
          label?: string
          setting_key?: string
          setting_type?: string
          setting_value?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      test_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
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
          {
            foreignKeyName: "test_packages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          result_format?: string
          test_category?: string | null
          test_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
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
          is_active: boolean
          name: string
          normal_range_max: number | null
          normal_range_min: number | null
          normal_range_text: string | null
          organization_id: string | null
          panel_items: Json | null
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
          is_active?: boolean
          name: string
          normal_range_max?: number | null
          normal_range_min?: number | null
          normal_range_text?: string | null
          organization_id?: string | null
          panel_items?: Json | null
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
          is_active?: boolean
          name?: string
          normal_range_max?: number | null
          normal_range_min?: number | null
          normal_range_text?: string | null
          organization_id?: string | null
          panel_items?: Json | null
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
          {
            foreignKeyName: "tests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      visitor_logs: {
        Row: {
          consent: Json | null
          country_code: string | null
          country_name: string | null
          created_at: string
          event_type: string
          id: string
          ip: string | null
          organization_id: string | null
          path: string | null
          referrer: string | null
          user_agent: string | null
        }
        Insert: {
          consent?: Json | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip?: string | null
          organization_id?: string | null
          path?: string | null
          referrer?: string | null
          user_agent?: string | null
        }
        Update: {
          consent?: Json | null
          country_code?: string | null
          country_name?: string | null
          created_at?: string
          event_type?: string
          id?: string
          ip?: string | null
          organization_id?: string | null
          path?: string | null
          referrer?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitor_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          event_type: string
          id: string
          message_id: string | null
          organization_id: string | null
          payload: Json
          phone_number_id: string | null
          received_at: string
          status: string | null
          wa_id: string | null
        }
        Insert: {
          event_type: string
          id?: string
          message_id?: string | null
          organization_id?: string | null
          payload: Json
          phone_number_id?: string | null
          received_at?: string
          status?: string | null
          wa_id?: string | null
        }
        Update: {
          event_type?: string
          id?: string
          message_id?: string | null
          organization_id?: string | null
          payload?: Json
          phone_number_id?: string | null
          received_at?: string
          status?: string | null
          wa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clone_catalog_to_organization: {
        Args: { p_source_org_id: string; p_target_org_id: string }
        Returns: Json
      }
      finance_sync_existing_invoices: {
        Args: { org_id: string }
        Returns: number
      }
      find_patient_candidates: {
        Args: { p_identifier: string; p_organization_id?: string }
        Returns: {
          email: string
          full_name: string
          id: string
          is_active: boolean
          organization_id: string
          patient_id: string
          phone: string
        }[]
      }
      generate_invoice_number: {
        Args: { p_organization_id?: string }
        Returns: string
      }
      get_dashboard_overview_analytics: {
        Args: { p_organization_id: string }
        Returns: {
          revenue_trends: Json
          test_trends: Json
          top_tests: Json
        }[]
      }
      get_dashboard_overview_stats: {
        Args: { p_organization_id: string }
        Returns: {
          completed_today: number
          employees: number
          in_progress_tests: number
          new_patients_this_week: number
          new_patients_today: number
          new_patients_yesterday: number
          outstanding_dues: number
          paid_invoices: number
          patients: number
          pending_invoices: number
          pending_tests: number
          revenue_this_month: number
          revenue_this_week: number
          revenue_today: number
          revenue_yesterday: number
          tests: number
          tests_yesterday: number
          total_revenue: number
        }[]
      }
      get_default_organization_id: { Args: never; Returns: string }
      get_invoice_organization_id: {
        Args: { _invoice_id: string }
        Returns: string
      }
      get_patient_organization_id: {
        Args: { _user_id: string }
        Returns: string
      }
      get_public_organization_context: {
        Args: { _domain?: string; _slug?: string }
        Returns: Json
      }
      get_user_lab_id: { Args: { _user_id: string }; Returns: string }
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
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
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      list_employee_sessions: {
        Args: { _current_session_id?: string }
        Returns: {
          browser: string
          created_at: string
          device_name: string
          ip: string
          is_current: boolean
          last_seen_at: string
          location: string
          os: string
          session_id: string
        }[]
      }
      list_patient_sessions: {
        Args: { _current_session_id?: string }
        Returns: {
          browser: string
          created_at: string
          device_name: string
          ip: string
          is_current: boolean
          last_seen_at: string
          location: string
          os: string
          session_id: string
        }[]
      }
      patient_login: {
        Args: { p_identifier: string; p_password: string }
        Returns: {
          address: string
          blood_group: string
          date_of_birth: string
          email: string
          full_name: string
          gender: string
          id: string
          is_active: boolean
          password_reset_required: boolean
          patient_id: string
          phone: string
        }[]
      }
      patient_login_scoped: {
        Args: {
          p_identifier: string
          p_organization_id?: string
          p_password: string
        }
        Returns: {
          address: string
          blood_group: string
          date_of_birth: string
          email: string
          full_name: string
          gender: string
          id: string
          is_active: boolean
          password_reset_required: boolean
          patient_id: string
          phone: string
        }[]
      }
      patient_reset_password: {
        Args: { p_new_password: string; p_patient_id: string }
        Returns: undefined
      }
      patient_set_password: {
        Args: {
          p_current_password: string
          p_new_password: string
          p_patient_id: string
        }
        Returns: boolean
      }
      register_visit: { Args: { p_payload: Json }; Returns: Json }
      revoke_all_employee_sessions: { Args: never; Returns: number }
      revoke_all_patient_sessions: { Args: never; Returns: number }
      revoke_employee_session: {
        Args: { _session_id: string }
        Returns: boolean
      }
      revoke_other_employee_sessions: {
        Args: { _current_session_id: string }
        Returns: number
      }
      revoke_other_patient_sessions: {
        Args: { _current_session_id: string }
        Returns: number
      }
      revoke_patient_session: {
        Args: { _session_id: string }
        Returns: boolean
      }
      seed_default_accounts: { Args: { org_id: string }; Returns: undefined }
      seed_outsource_accounts: { Args: { org_id: string }; Returns: undefined }
      upsert_employee_session: {
        Args: {
          _browser?: string
          _device_name?: string
          _ip?: string
          _location?: string
          _os?: string
          _session_id: string
          _user_agent?: string
        }
        Returns: undefined
      }
      upsert_patient_session: {
        Args: {
          _browser?: string
          _device_name?: string
          _ip?: string
          _location?: string
          _os?: string
          _session_id: string
          _user_agent?: string
        }
        Returns: undefined
      }
      user_has_lab_access: {
        Args: { _lab_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_operational_organization_access: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_organization_access: {
        Args: { _organization_id: string; _user_id: string }
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

