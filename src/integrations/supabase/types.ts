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
    PostgrestVersion: "13.0.5"
  }
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      agent_status: {
        Row: {
          agent_type: string
          created_at: string | null
          current_session_id: string | null
          id: string
          last_activity: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agent_type?: string
          created_at?: string | null
          current_session_id?: string | null
          id?: string
          last_activity?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agent_type?: string
          created_at?: string | null
          current_session_id?: string | null
          id?: string
          last_activity?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_status_current_session_id_fkey"
            columns: ["current_session_id"]
            isOneToOne: false
            referencedRelation: "verification_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          created_at: string | null
          email: string
          id: string
          licensed_accounts: string[] | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          licensed_accounts?: string[] | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          licensed_accounts?: string[] | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_carrier_licenses: {
        Row: {
          agent_user_id: string
          carrier_id: string
          created_at: string
          id: string
          is_licensed: boolean | null
          license_end_date: string | null
          license_start_date: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          agent_user_id: string
          carrier_id: string
          created_at?: string
          id?: string
          is_licensed?: boolean | null
          license_end_date?: string | null
          license_start_date?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          agent_user_id?: string
          carrier_id?: string
          created_at?: string
          id?: string
          is_licensed?: boolean | null
          license_end_date?: string | null
          license_start_date?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_carrier_licenses_carrier_id_fkey"
            columns: ["carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_state_licenses: {
        Row: {
          agent_user_id: string
          created_at: string
          id: string
          is_licensed: boolean | null
          license_end_date: string | null
          license_number: string | null
          license_start_date: string | null
          notes: string | null
          state_id: string
          updated_at: string
        }
        Insert: {
          agent_user_id: string
          created_at?: string
          id?: string
          is_licensed?: boolean | null
          license_end_date?: string | null
          license_number?: string | null
          license_start_date?: string | null
          notes?: string | null
          state_id: string
          updated_at?: string
        }
        Update: {
          agent_user_id?: string
          created_at?: string
          id?: string
          is_licensed?: boolean | null
          license_end_date?: string | null
          license_number?: string | null
          license_start_date?: string | null
          notes?: string | null
          state_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_state_licenses_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          carrier_code: string | null
          carrier_name: string
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          carrier_code?: string | null
          carrier_name: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          carrier_code?: string | null
          carrier_name?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      states: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          notes: string | null
          state_code: string
          state_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          state_code: string
          state_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          notes?: string | null
          state_code?: string
          state_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_results: {
        Row: {
          accident_date: string | null
          accident_location: string | null
          accident_scenario: string | null
          agent_id: string | null
          agent_who_took_call: string | null
          application_submitted: boolean | null
          buffer_agent: string | null
          call_source: string | null
          carrier: string | null
          contact_address: string | null
          contact_name: string | null
          contact_number: string | null
          coverage_amount: number | null
          created_at: string | null
          dq_reason: string | null
          draft_date: string | null
          face_amount: number | null
          id: string
          injuries: string | null
          insurance_company: string | null
          insured: boolean | null
          lead_id: string | null
          licensed_agent_account: string | null
          medical_attention: string | null
          monthly_premium: number | null
          new_draft_date: string | null
          notes: string | null
          other_party_admit_fault: boolean | null
          passengers_count: number | null
          police_attended: boolean | null
          prior_attorney_details: string | null
          prior_attorney_involved: boolean | null
          product_type: string | null
          sent_to_underwriting: boolean | null
          status: string | null
          submission_date: string | null
          submission_id: string | null
          submitting_agent: string | null
          third_party_vehicle_registration: string | null
          updated_at: string | null
          user_id: string | null
          vehicle_registration: string | null
          is_callback: boolean | null
          is_retention_call: boolean | null
        }
        Insert: {
          accident_date?: string | null
          accident_location?: string | null
          accident_scenario?: string | null
          agent_id?: string | null
          agent_who_took_call?: string | null
          application_submitted?: boolean | null
          buffer_agent?: string | null
          call_source?: string | null
          carrier?: string | null
          contact_address?: string | null
          contact_name?: string | null
          contact_number?: string | null
          coverage_amount?: number | null
          created_at?: string | null
          dq_reason?: string | null
          draft_date?: string | null
          face_amount?: number | null
          id?: string
          injuries?: string | null
          insurance_company?: string | null
          insured?: boolean | null
          lead_id?: string | null
          licensed_agent_account?: string | null
          medical_attention?: string | null
          monthly_premium?: number | null
          new_draft_date?: string | null
          notes?: string | null
          other_party_admit_fault?: boolean | null
          passengers_count?: number | null
          police_attended?: boolean | null
          prior_attorney_details?: string | null
          prior_attorney_involved?: boolean | null
          product_type?: string | null
          sent_to_underwriting?: boolean | null
          status?: string | null
          submission_date?: string | null
          submission_id?: string | null
          submitting_agent?: string | null
          third_party_vehicle_registration?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_registration?: string | null
          is_callback?: boolean | null
          is_retention_call?: boolean | null
        }
        Update: {
          accident_date?: string | null
          accident_location?: string | null
          accident_scenario?: string | null
          agent_id?: string | null
          agent_who_took_call?: string | null
          application_submitted?: boolean | null
          buffer_agent?: string | null
          call_source?: string | null
          carrier?: string | null
          contact_address?: string | null
          contact_name?: string | null
          contact_number?: string | null
          coverage_amount?: number | null
          created_at?: string | null
          dq_reason?: string | null
          draft_date?: string | null
          face_amount?: number | null
          id?: string
          injuries?: string | null
          insurance_company?: string | null
          insured?: boolean | null
          lead_id?: string | null
          licensed_agent_account?: string | null
          medical_attention?: string | null
          monthly_premium?: number | null
          new_draft_date?: string | null
          notes?: string | null
          other_party_admit_fault?: boolean | null
          passengers_count?: number | null
          police_attended?: boolean | null
          prior_attorney_details?: string | null
          prior_attorney_involved?: boolean | null
          product_type?: string | null
          sent_to_underwriting?: boolean | null
          status?: string | null
          submission_date?: string | null
          submission_id?: string | null
          submitting_agent?: string | null
          third_party_vehicle_registration?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_registration?: string | null
          is_callback?: boolean | null
          is_retention_call?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "call_results_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      call_update_logs: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          agent_type: string
          call_result_id: string | null
          created_at: string | null
          customer_name: string | null
          event_details: Json | null
          event_type: string
          id: string
          lead_vendor: string | null
          session_id: string | null
          submission_id: string
          updated_at: string | null
          verification_session_id: string | null
          is_retention_call: boolean | null
        }
        Insert: {
          agent_id?: string | null
          agent_name?: string | null
          agent_type: string
          call_result_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          event_details?: Json | null
          event_type: string
          id?: string
          lead_vendor?: string | null
          session_id?: string | null
          submission_id: string
          updated_at?: string | null
          verification_session_id?: string | null
          is_retention_call?: boolean | null
        }
        Update: {
          agent_id?: string | null
          agent_name?: string | null
          agent_type?: string
          call_result_id?: string | null
          created_at?: string | null
          customer_name?: string | null
          event_details?: Json | null
          event_type?: string
          id?: string
          lead_vendor?: string | null
          session_id?: string | null
          submission_id?: string
          updated_at?: string | null
          verification_session_id?: string | null
          is_retention_call?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "call_update_logs_verification_session_id_fkey"
            columns: ["verification_session_id"]
            isOneToOne: false
            referencedRelation: "verification_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_deal_flow: {
        Row: {
          agent: string | null
          buffer_agent: string | null
          call_result: string | null
          carrier: string | null
          carrier_audit: string | null
          client_phone_number: string | null
          created_at: string | null
          date: string | null
          draft_date: string | null
          face_amount: number | null
          from_callback: boolean | null
          ghl_location_id: string | null
          ghl_opportunity_id: string | null
          ghlcontactid: string | null
          id: string
          insured_name: string | null
          is_callback: boolean | null
          is_retention_call: boolean | null
          lead_vendor: string | null
          level_or_gi: string | null
          licensed_agent_account: string | null
          monthly_premium: number | null
          notes: string | null
          placement_status: string | null
          policy_number: string | null
          product_type: string | null
          product_type_carrier: string | null
          status: string | null
          submission_id: string
          sync_status: string | null
          tag: string | null
          updated_at: string | null
        }
        Insert: {
          agent?: string | null
          buffer_agent?: string | null
          call_result?: string | null
          carrier?: string | null
          carrier_audit?: string | null
          client_phone_number?: string | null
          created_at?: string | null
          date?: string | null
          draft_date?: string | null
          face_amount?: number | null
          from_callback?: boolean | null
          ghl_location_id?: string | null
          ghl_opportunity_id?: string | null
          ghlcontactid?: string | null
          id?: string
          insured_name?: string | null
          is_callback?: boolean | null
          is_retention_call?: boolean | null
          lead_vendor?: string | null
          level_or_gi?: string | null
          licensed_agent_account?: string | null
          monthly_premium?: number | null
          notes?: string | null
          placement_status?: string | null
          policy_number?: string | null
          product_type?: string | null
          product_type_carrier?: string | null
          status?: string | null
          submission_id: string
          sync_status?: string | null
          tag?: string | null
          updated_at?: string | null
        }
        Update: {
          agent?: string | null
          buffer_agent?: string | null
          call_result?: string | null
          carrier?: string | null
          carrier_audit?: string | null
          client_phone_number?: string | null
          created_at?: string | null
          date?: string | null
          draft_date?: string | null
          face_amount?: number | null
          from_callback?: boolean | null
          ghl_location_id?: string | null
          ghl_opportunity_id?: string | null
          ghlcontactid?: string | null
          id?: string
          insured_name?: string | null
          is_callback?: boolean | null
          is_retention_call?: boolean | null
          lead_vendor?: string | null
          level_or_gi?: string | null
          licensed_agent_account?: string | null
          monthly_premium?: number | null
          notes?: string | null
          placement_status?: string | null
          policy_number?: string | null
          product_type?: string | null
          product_type_carrier?: string | null
          status?: string | null
          submission_id?: string
          sync_status?: string | null
          tag?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          account_type: string | null
          additional_notes: string | null
          age: number | null
          agent: string | null
          beneficiary_account: string | null
          beneficiary_information: string | null
          beneficiary_routing: string | null
          birth_state: string | null
          buffer_agent: string | null
          carrier: string | null
          city: string | null
          coverage_amount: number | null
          created_at: string | null
          customer_full_name: string | null
          date_of_birth: string | null
          doctors_name: string | null
          draft_date: string | null
          driver_license: string | null
          email: string | null
          existing_coverage: string | null
          future_draft_date: string | null
          health_conditions: string | null
          height: string | null
          id: string
          institution_name: string | null
          lead_vendor: string | null
          medications: string | null
          monthly_premium: number | null
          phone_number: string | null
          previous_applications: string | null
          product_type: string | null
          social_security: string | null
          status: string | null
          tag: string | null
          state: string | null
          street_address: string | null
          submission_date: string | null
          submission_id: string | null
          accident_date: string | null
          prior_attorney_involved: boolean | null
          prior_attorney_details: string | null
          medical_attention: string | null
          police_attended: boolean | null
          accident_location: string | null
          accident_scenario: string | null
          insured: boolean | null
          injuries: string | null
          vehicle_registration: string | null
          insurance_company: string | null
          third_party_vehicle_registration: string | null
          other_party_admit_fault: boolean | null
          passengers_count: number | null
          contact_name: string | null
          contact_number: string | null
          contact_address: string | null
          tobacco_use: string | null
          updated_at: string | null
          user_id: string | null
          weight: string | null
          zip_code: string | null
          is_callback: boolean | null
          is_retention_call: boolean | null
        }
        Insert: {
          account_type?: string | null
          additional_notes?: string | null
          age?: number | null
          agent?: string | null
          beneficiary_account?: string | null
          beneficiary_information?: string | null
          beneficiary_routing?: string | null
          birth_state?: string | null
          buffer_agent?: string | null
          carrier?: string | null
          city?: string | null
          coverage_amount?: number | null
          created_at?: string | null
          customer_full_name?: string | null
          date_of_birth?: string | null
          doctors_name?: string | null
          draft_date?: string | null
          driver_license?: string | null
          email?: string | null
          existing_coverage?: string | null
          future_draft_date?: string | null
          health_conditions?: string | null
          height?: string | null
          id?: string
          institution_name?: string | null
          lead_vendor?: string | null
          medications?: string | null
          monthly_premium?: number | null
          phone_number?: string | null
          previous_applications?: string | null
          product_type?: string | null
          social_security?: string | null
          status?: string | null
          tag?: string | null
          state?: string | null
          street_address?: string | null
          submission_date?: string | null
          submission_id?: string | null
          accident_date?: string | null
          prior_attorney_involved?: boolean | null
          prior_attorney_details?: string | null
          medical_attention?: string | null
          police_attended?: boolean | null
          accident_location?: string | null
          accident_scenario?: string | null
          insured?: boolean | null
          injuries?: string | null
          vehicle_registration?: string | null
          insurance_company?: string | null
          third_party_vehicle_registration?: string | null
          other_party_admit_fault?: boolean | null
          passengers_count?: number | null
          contact_name?: string | null
          contact_number?: string | null
          contact_address?: string | null
          tobacco_use?: string | null
          updated_at?: string | null
          user_id?: string | null
          weight?: string | null
          zip_code?: string | null
          is_callback?: boolean | null
          is_retention_call?: boolean | null
        }
        Update: {
          account_type?: string | null
          additional_notes?: string | null
          age?: number | null
          agent?: string | null
          beneficiary_account?: string | null
          beneficiary_information?: string | null
          beneficiary_routing?: string | null
          birth_state?: string | null
          buffer_agent?: string | null
          carrier?: string | null
          city?: string | null
          coverage_amount?: number | null
          created_at?: string | null
          customer_full_name?: string | null
          date_of_birth?: string | null
          doctors_name?: string | null
          draft_date?: string | null
          driver_license?: string | null
          email?: string | null
          existing_coverage?: string | null
          future_draft_date?: string | null
          health_conditions?: string | null
          height?: string | null
          id?: string
          institution_name?: string | null
          lead_vendor?: string | null
          medications?: string | null
          monthly_premium?: number | null
          phone_number?: string | null
          previous_applications?: string | null
          product_type?: string | null
          social_security?: string | null
          status?: string | null
          tag?: string | null
          state?: string | null
          street_address?: string | null
          submission_date?: string | null
          submission_id?: string | null
          accident_date?: string | null
          prior_attorney_involved?: boolean | null
          prior_attorney_details?: string | null
          medical_attention?: string | null
          police_attended?: boolean | null
          accident_location?: string | null
          accident_scenario?: string | null
          insured?: boolean | null
          injuries?: string | null
          vehicle_registration?: string | null
          insurance_company?: string | null
          third_party_vehicle_registration?: string | null
          other_party_admit_fault?: boolean | null
          passengers_count?: number | null
          contact_name?: string | null
          contact_number?: string | null
          contact_address?: string | null
          tobacco_use?: string | null
          updated_at?: string | null
          user_id?: string | null
          weight?: string | null
          zip_code?: string | null
          is_callback?: boolean | null
          is_retention_call?: boolean | null
        }
        Relationships: []
      }
      portal_stages: {
        Row: {
          id: string
          pipeline: string
          key: string
          label: string
          display_order: number
          column_class: string | null
          header_class: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          pipeline: string
          key: string
          label: string
          display_order?: number
          column_class?: string | null
          header_class?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          pipeline?: string
          key?: string
          label?: string
          display_order?: number
          column_class?: string | null
          header_class?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          agent_code: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_code?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_code?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          user_id: string | null
          role: string
          is_active: boolean | null
          assigned_at: string | null
          assigned_by: string | null
          notes: string | null
          created_at: string | null
          updated_at: string | null
          is_admin_bypass: boolean | null
          bypass_code: string | null
          bypass_expires_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          role: string
          is_active?: boolean | null
          assigned_at?: string | null
          assigned_by?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_admin_bypass?: boolean | null
          bypass_code?: string | null
          bypass_expires_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          role?: string
          is_active?: boolean | null
          assigned_at?: string | null
          assigned_by?: string | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
          is_admin_bypass?: boolean | null
          bypass_code?: string | null
          bypass_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_items: {
        Row: {
          created_at: string | null
          field_category: string | null
          field_name: string
          id: string
          is_modified: boolean | null
          is_verified: boolean | null
          notes: string | null
          original_value: string | null
          session_id: string
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
          verified_value: string | null
        }
        Insert: {
          created_at?: string | null
          field_category?: string | null
          field_name: string
          id?: string
          is_modified?: boolean | null
          is_verified?: boolean | null
          notes?: string | null
          original_value?: string | null
          session_id: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_value?: string | null
        }
        Update: {
          created_at?: string | null
          field_category?: string | null
          field_name?: string
          id?: string
          is_modified?: boolean | null
          is_verified?: boolean | null
          notes?: string | null
          original_value?: string | null
          session_id?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "verification_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_sessions: {
        Row: {
          buffer_agent_id: string | null
          claimed_at: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          licensed_agent_id: string | null
          progress_percentage: number | null
          started_at: string | null
          status: string
          submission_id: string
          total_fields: number | null
          transferred_at: string | null
          updated_at: string | null
          verified_fields: number | null
          is_retention_call: boolean | null
        }
        Insert: {
          buffer_agent_id?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          licensed_agent_id?: string | null
          progress_percentage?: number | null
          started_at?: string | null
          status?: string
          submission_id: string
          total_fields?: number | null
          transferred_at?: string | null
          updated_at?: string | null
          verified_fields?: number | null
          is_retention_call?: boolean | null
        }
        Update: {
          buffer_agent_id?: string | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          licensed_agent_id?: string | null
          progress_percentage?: number | null
          started_at?: string | null
          status?: string
          submission_id?: string
          total_fields?: number | null
          transferred_at?: string | null
          updated_at?: string | null
          verified_fields?: number | null
          is_retention_call?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_sessions_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["submission_id"]
          },
        ]
      }
    }
    Views: {
      buffer_agents_view: {
        Row: {
          agent_status_created: string | null
          agent_type: string | null
          display_name: string | null
          email: string | null
          last_activity: string | null
          profile_created: string | null
          status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      daily_agent_stats: {
        Row: {
          agent_id: string | null
          agent_name: string | null
          agent_type: string | null
          disconnected_calls: number | null
          dropped_calls: number | null
          log_date: string | null
          not_submitted: number | null
          not_submitted_transfers: number | null
          picked_up_calls: number | null
          submitted_sales: number | null
          submitted_transfers_sales: number | null
          transferred_to_agent_calls: number | null
        }
        Relationships: []
      }
      debug_user_data: {
        Row: {
          agent_type: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          status: string | null
          table_name: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_dashboard_analytics: {
        Args: Record<PropertyKey, never>
        Returns: {
          total_leads: number
          submitted_leads: number
          pending_leads: number
          leads_this_week: number
          no_results_count: number
        }[]
      }
      initialize_verification_items: {
        Args: { session_id_param: string; submission_id_param: string }
        Returns: undefined
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      log_call_update: {
        Args: {
          p_agent_id: string
          p_agent_name: string
          p_agent_type: string
          p_call_result_id?: string
          p_customer_name?: string
          p_event_details?: Json
          p_event_type: string
          p_is_retention_call?: boolean
          p_lead_vendor?: string
          p_session_id?: string
          p_submission_id: string
          p_verification_session_id?: string
        }
        Returns: string
      }
      setup_buffer_agents: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
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
    Enums: {},
  },
} as const
