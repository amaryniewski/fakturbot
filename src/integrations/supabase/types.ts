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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          nip: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          nip?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          nip?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          auto_import_emails: boolean
          auto_send_to_accounting: boolean
          auto_send_to_ocr: boolean
          company_id: string
          updated_at: string
        }
        Insert: {
          auto_import_emails?: boolean
          auto_send_to_accounting?: boolean
          auto_send_to_ocr?: boolean
          company_id: string
          updated_at?: string
        }
        Update: {
          auto_import_emails?: boolean
          auto_send_to_accounting?: boolean
          auto_send_to_ocr?: boolean
          company_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fakturownia_connections: {
        Row: {
          api_token: string
          company_name: string
          created_at: string
          domain: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          api_token: string
          company_name: string
          created_at?: string
          domain: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          api_token?: string
          company_name?: string
          created_at?: string
          domain?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gmail_connections: {
        Row: {
          access_token: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gmail_filter_settings: {
        Row: {
          allowed_sender_emails: string[] | null
          created_at: string
          filter_query: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_sender_emails?: string[] | null
          created_at?: string
          filter_query?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_sender_emails?: string[] | null
          created_at?: string
          filter_query?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          created_at: string
          gross_amount: number | null
          id: string
          invoice_id: string
          item_name: string
          net_amount: number | null
          quantity: number | null
          unit_price: number | null
          updated_at: string
          user_id: string
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          created_at?: string
          gross_amount?: number | null
          id?: string
          invoice_id: string
          item_name: string
          net_amount?: number | null
          quantity?: number | null
          unit_price?: number | null
          updated_at?: string
          user_id: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          created_at?: string
          gross_amount?: number | null
          id?: string
          invoice_id?: string
          item_name?: string
          net_amount?: number | null
          quantity?: number | null
          unit_price?: number | null
          updated_at?: string
          user_id?: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: []
      }
      invoice_processing_rules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          rule_config: Json
          rule_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          rule_config: Json
          rule_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          rule_config?: Json
          rule_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          buyer_name: string | null
          buyer_nip: string | null
          confidence_score: number | null
          created_at: string
          error_message: string | null
          extracted_data: Json | null
          file_name: string
          file_size: number | null
          file_url: string | null
          gmail_message_id: string | null
          id: string
          last_processing_error: string | null
          needs_review: boolean | null
          ocr_provider: string | null
          processing_attempts: number | null
          received_at: string
          sender_email: string
          status: string
          subject: string | null
          total_gross: number | null
          total_net: number | null
          total_vat: number | null
          updated_at: string
          user_id: string
          vendor_name: string | null
          vendor_nip: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          confidence_score?: number | null
          created_at?: string
          error_message?: string | null
          extracted_data?: Json | null
          file_name: string
          file_size?: number | null
          file_url?: string | null
          gmail_message_id?: string | null
          id?: string
          last_processing_error?: string | null
          needs_review?: boolean | null
          ocr_provider?: string | null
          processing_attempts?: number | null
          received_at: string
          sender_email: string
          status?: string
          subject?: string | null
          total_gross?: number | null
          total_net?: number | null
          total_vat?: number | null
          updated_at?: string
          user_id: string
          vendor_name?: string | null
          vendor_nip?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          buyer_name?: string | null
          buyer_nip?: string | null
          confidence_score?: number | null
          created_at?: string
          error_message?: string | null
          extracted_data?: Json | null
          file_name?: string
          file_size?: number | null
          file_url?: string | null
          gmail_message_id?: string | null
          id?: string
          last_processing_error?: string | null
          needs_review?: boolean | null
          ocr_provider?: string | null
          processing_attempts?: number | null
          received_at?: string
          sender_email?: string
          status?: string
          subject?: string | null
          total_gross?: number | null
          total_net?: number | null
          total_vat?: number | null
          updated_at?: string
          user_id?: string
          vendor_name?: string | null
          vendor_nip?: string | null
        }
        Relationships: []
      }
      mailbox_tokens: {
        Row: {
          access_token: string
          expires_at: string | null
          mailbox_id: string
          refresh_token: string | null
        }
        Insert: {
          access_token: string
          expires_at?: string | null
          mailbox_id: string
          refresh_token?: string | null
        }
        Update: {
          access_token?: string
          expires_at?: string | null
          mailbox_id?: string
          refresh_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mailbox_tokens_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: true
            referencedRelation: "mailboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      mailboxes: {
        Row: {
          company_id: string
          created_at: string
          email: string
          id: string
          last_dispatch_at: string | null
          last_sync_at: string | null
          locked_until: string | null
          port: number | null
          processed_label_id: string | null
          provider: Database["public"]["Enums"]["mail_provider"]
          server: string | null
          status: Database["public"]["Enums"]["mailbox_status"]
        }
        Insert: {
          company_id: string
          created_at?: string
          email: string
          id?: string
          last_dispatch_at?: string | null
          last_sync_at?: string | null
          locked_until?: string | null
          port?: number | null
          processed_label_id?: string | null
          provider: Database["public"]["Enums"]["mail_provider"]
          server?: string | null
          status?: Database["public"]["Enums"]["mailbox_status"]
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string
          id?: string
          last_dispatch_at?: string | null
          last_sync_at?: string | null
          locked_until?: string | null
          port?: number | null
          processed_label_id?: string | null
          provider?: Database["public"]["Enums"]["mail_provider"]
          server?: string | null
          status?: Database["public"]["Enums"]["mailbox_status"]
        }
        Relationships: [
          {
            foreignKeyName: "mailboxes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_comparisons: {
        Row: {
          claude_vision_result_id: string | null
          comparison_data: Json | null
          confidence_score: number | null
          created_at: string | null
          final_decision: Json | null
          id: string
          invoice_id: string | null
          needs_manual_review: boolean | null
          ocr_space_result_id: string | null
        }
        Insert: {
          claude_vision_result_id?: string | null
          comparison_data?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          final_decision?: Json | null
          id?: string
          invoice_id?: string | null
          needs_manual_review?: boolean | null
          ocr_space_result_id?: string | null
        }
        Update: {
          claude_vision_result_id?: string | null
          comparison_data?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          final_decision?: Json | null
          id?: string
          invoice_id?: string | null
          needs_manual_review?: boolean | null
          ocr_space_result_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_comparisons_claude_vision_result_id_fkey"
            columns: ["claude_vision_result_id"]
            isOneToOne: false
            referencedRelation: "ocr_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_comparisons_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_comparisons_ocr_space_result_id_fkey"
            columns: ["ocr_space_result_id"]
            isOneToOne: false
            referencedRelation: "ocr_results"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_results: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          error_message: string | null
          id: string
          invoice_id: string | null
          processing_time_ms: number | null
          provider: string
          raw_text: string | null
          structured_data: Json | null
          success: boolean | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          processing_time_ms?: number | null
          provider: string
          raw_text?: string | null
          structured_data?: Json | null
          success?: boolean | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          processing_time_ms?: number | null
          provider?: string
          raw_text?: string | null
          structured_data?: Json | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_results_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: unknown | null
          record_id: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          record_id?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown | null
          record_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_automation_settings: {
        Row: {
          auto_import_emails: boolean
          auto_send_to_accounting: boolean
          auto_send_to_ocr: boolean
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_import_emails?: boolean
          auto_send_to_accounting?: boolean
          auto_send_to_ocr?: boolean
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_import_emails?: boolean
          auto_send_to_accounting?: boolean
          auto_send_to_ocr?: boolean
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      audit_and_clean_cross_user_invoices: {
        Args: Record<PropertyKey, never>
        Returns: {
          cleaned_invoices: string[]
          security_report: Json
          violation_count: number
        }[]
      }
      audit_and_fix_cross_user_invoices: {
        Args: Record<PropertyKey, never>
        Returns: {
          action_type: string
          correct_user_id: string
          file_path_new: string
          file_path_old: string
          gmail_message_id: string
          invoice_id: string
          status: string
          wrong_user_id: string
        }[]
      }
      audit_user_data_access: {
        Args: {
          p_details?: Json
          p_operation: string
          p_table_name: string
          p_user_id: string
        }
        Returns: undefined
      }
      auto_process_gmail_emails: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      can_access_connection_tokens: {
        Args: { p_connection_id: string; p_table_name: string }
        Returns: boolean
      }
      check_data_isolation_violations: {
        Args: Record<PropertyKey, never>
        Returns: {
          affected_users: string[]
          details: Json
          recommended_action: string
          severity: string
          violation_type: string
        }[]
      }
      check_fakturownia_connection_exists: {
        Args: { p_domain: string }
        Returns: boolean
      }
      check_gmail_connection_exists: {
        Args: { p_email: string }
        Returns: boolean
      }
      check_token_security: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      create_default_membership: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      decrypt_token: {
        Args: { encrypted_value: string }
        Returns: string
      }
      emergency_data_isolation_cleanup: {
        Args: Record<PropertyKey, never>
        Returns: {
          cleaned_invoices: number
          security_violations: Json
        }[]
      }
      emergency_security_lockdown: {
        Args: Record<PropertyKey, never>
        Returns: {
          action_taken: string
          affected_records: number
          status: string
        }[]
      }
      encrypt_existing_tokens: {
        Args: Record<PropertyKey, never>
        Returns: {
          status: string
          table_name: string
          tokens_encrypted: number
        }[]
      }
      encrypt_token: {
        Args: { token_value: string }
        Returns: string
      }
      get_all_active_gmail_connections_for_processing: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          email: string
          id: string
          user_id: string
        }[]
      }
      get_decrypted_fakturownia_connection: {
        Args: { p_connection_id: string }
        Returns: {
          api_token: string
          company_name: string
          domain: string
        }[]
      }
      get_decrypted_gmail_tokens: {
        Args: { p_connection_id: string }
        Returns: {
          access_token: string
          email: string
          refresh_token: string
          token_expires_at: string
        }[]
      }
      get_decrypted_gmail_tokens_with_user: {
        Args: { p_connection_id: string }
        Returns: {
          access_token: string
          email: string
          refresh_token: string
          token_expires_at: string
          user_id: string
        }[]
      }
      get_decrypted_mailbox_tokens: {
        Args: { p_mailbox_id: string }
        Returns: {
          access_token: string
          expires_at: string
          refresh_token: string
        }[]
      }
      get_gmail_message_owner: {
        Args: { p_gmail_message_id: string }
        Returns: string
      }
      get_safe_fakturownia_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          company_name: string
          created_at: string
          domain: string
          id: string
          is_active: boolean
          updated_at: string
        }[]
      }
      get_safe_gmail_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          token_expires_at: string
          updated_at: string
        }[]
      }
      get_safe_mailbox_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          company_id: string
          created_at: string
          email: string
          has_tokens: boolean
          id: string
          last_sync_at: string
          port: number
          provider: string
          server: string
          status: string
        }[]
      }
      get_user_data_isolation_report: {
        Args: Record<PropertyKey, never>
        Returns: {
          fakturownia_connections_count: number
          gmail_connections_count: number
          invoice_count: number
          potential_security_issues: Json
          storage_files_count: number
          user_id: string
        }[]
      }
      get_user_fakturownia_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          company_name: string
          created_at: string
          domain: string
          id: string
          is_active: boolean
          updated_at: string
        }[]
      }
      get_user_gmail_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          token_expires_at: string
          updated_at: string
        }[]
      }
      get_user_gmail_connections_secure: {
        Args: Record<PropertyKey, never>
        Returns: {
          created_at: string
          email: string
          id: string
          user_id: string
        }[]
      }
      get_user_invoice_stats: {
        Args: { p_user_id: string }
        Returns: {
          failed_count: number
          new_count: number
          processing_count: number
          success_count: number
          total_count: number
        }[]
      }
      insert_encrypted_fakturownia_connection: {
        Args: {
          p_api_token: string
          p_company_name: string
          p_domain: string
          p_user_id: string
        }
        Returns: string
      }
      insert_encrypted_fakturownia_connection_secure: {
        Args: { p_api_token: string; p_company_name: string; p_domain: string }
        Returns: string
      }
      insert_encrypted_gmail_connection: {
        Args: {
          p_access_token: string
          p_email: string
          p_refresh_token: string
          p_token_expires_at?: string
        }
        Returns: string
      }
      insert_encrypted_gmail_connection_for_user: {
        Args: {
          p_access_token: string
          p_email: string
          p_refresh_token: string
          p_token_expires_at?: string
          p_user_id: string
        }
        Returns: string
      }
      insert_encrypted_gmail_connection_secure: {
        Args: {
          p_access_token: string
          p_email: string
          p_refresh_token: string
          p_token_expires_at?: string
        }
        Returns: string
      }
      insert_encrypted_mailbox_tokens: {
        Args: {
          p_access_token: string
          p_expires_at?: string
          p_mailbox_id: string
          p_refresh_token?: string
        }
        Returns: boolean
      }
      insert_encrypted_mailbox_tokens_secure: {
        Args: {
          p_access_token: string
          p_expires_at?: string
          p_mailbox_id: string
          p_refresh_token?: string
        }
        Returns: boolean
      }
      is_member: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      log_data_access: {
        Args: { p_action: string; p_table_name: string; p_user_id: string }
        Returns: undefined
      }
      log_data_access_attempt: {
        Args: {
          p_action: string
          p_resource_id: string
          p_resource_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      log_token_access: {
        Args: { p_action: string; p_record_id: string; p_table_name: string }
        Returns: undefined
      }
      monitor_security_violations: {
        Args: Record<PropertyKey, never>
        Returns: {
          affected_users: string[]
          details: Json
          recommended_action: string
          severity: string
          violation_count: number
          violation_type: string
        }[]
      }
      revoke_connection: {
        Args: { p_connection_id: string; p_connection_type: string }
        Returns: boolean
      }
      revoke_mailbox_tokens: {
        Args: { p_mailbox_id: string }
        Returns: boolean
      }
      update_encrypted_gmail_tokens: {
        Args: {
          p_access_token: string
          p_connection_id: string
          p_refresh_token?: string
          p_token_expires_at?: string
        }
        Returns: boolean
      }
      update_encrypted_mailbox_tokens: {
        Args: {
          p_access_token: string
          p_expires_at?: string
          p_mailbox_id: string
          p_refresh_token?: string
        }
        Returns: boolean
      }
      validate_all_tokens_encrypted: {
        Args: Record<PropertyKey, never>
        Returns: {
          security_status: string
          table_name: string
          unencrypted_tokens: number
        }[]
      }
      validate_complete_data_isolation: {
        Args: Record<PropertyKey, never>
        Returns: {
          isolation_status: string
          potential_violations: Json
          table_name: string
          user_count: number
        }[]
      }
      validate_connection_ownership: {
        Args: { p_connection_id: string; p_user_id: string }
        Returns: boolean
      }
      validate_connection_ownership_enhanced: {
        Args: { p_connection_id: string; p_user_id: string }
        Returns: boolean
      }
      validate_edge_function_security: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      validate_file_path_security: {
        Args: { p_file_path: string; p_user_id: string }
        Returns: boolean
      }
      validate_invoice_gmail_ownership: {
        Args: { p_gmail_message_id: string; p_user_id: string }
        Returns: boolean
      }
      validate_invoice_ownership: {
        Args: { p_invoice_id: string; p_user_id: string }
        Returns: boolean
      }
      validate_invoice_ownership_enhanced: {
        Args: { p_invoice_id: string; p_user_id: string }
        Returns: boolean
      }
      validate_token_encryption: {
        Args: Record<PropertyKey, never>
        Returns: {
          has_unencrypted_tokens: boolean
          table_name: string
        }[]
      }
      validate_user_access: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      verify_token_access_security: {
        Args: Record<PropertyKey, never>
        Returns: {
          access_level: string
          is_secure: boolean
          table_name: string
        }[]
      }
    }
    Enums: {
      mail_provider: "gmail" | "outlook" | "imap"
      mailbox_status: "active" | "inactive"
      member_role: "owner" | "admin" | "member" | "viewer"
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
      mail_provider: ["gmail", "outlook", "imap"],
      mailbox_status: ["active", "inactive"],
      member_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
