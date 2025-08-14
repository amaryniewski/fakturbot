export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
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
          confidence_score: number | null
          created_at: string
          error_message: string | null
          extracted_data: Json | null
          file_name: string
          file_size: number | null
          file_url: string | null
          gmail_message_id: string | null
          id: string
          needs_review: boolean | null
          received_at: string
          sender_email: string
          status: string
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          error_message?: string | null
          extracted_data?: Json | null
          file_name: string
          file_size?: number | null
          file_url?: string | null
          gmail_message_id?: string | null
          id?: string
          needs_review?: boolean | null
          received_at: string
          sender_email: string
          status?: string
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          error_message?: string | null
          extracted_data?: Json | null
          file_name?: string
          file_size?: number | null
          file_url?: string | null
          gmail_message_id?: string | null
          id?: string
          needs_review?: boolean | null
          received_at?: string
          sender_email?: string
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_connection_tokens: {
        Args: { p_connection_id: string; p_table_name: string }
        Returns: boolean
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
      decrypt_token: {
        Args: { encrypted_value: string }
        Returns: string
      }
      encrypt_existing_tokens: {
        Args: Record<PropertyKey, never>
        Returns: {
          table_name: string
          tokens_encrypted: number
          status: string
        }[]
      }
      encrypt_token: {
        Args: { token_value: string }
        Returns: string
      }
      get_all_active_gmail_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          email: string
          user_id: string
          created_at: string
        }[]
      }
      get_decrypted_fakturownia_connection: {
        Args: { p_connection_id: string }
        Returns: {
          company_name: string
          domain: string
          api_token: string
        }[]
      }
      get_decrypted_gmail_tokens: {
        Args: { p_connection_id: string }
        Returns: {
          access_token: string
          refresh_token: string
          email: string
          token_expires_at: string
        }[]
      }
      get_decrypted_gmail_tokens_with_user: {
        Args: { p_connection_id: string }
        Returns: {
          access_token: string
          refresh_token: string
          email: string
          token_expires_at: string
          user_id: string
        }[]
      }
      get_decrypted_mailbox_tokens: {
        Args: { p_mailbox_id: string }
        Returns: {
          access_token: string
          refresh_token: string
          expires_at: string
        }[]
      }
      get_safe_fakturownia_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          company_name: string
          domain: string
          is_active: boolean
          created_at: string
          updated_at: string
        }[]
      }
      get_safe_gmail_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          email: string
          is_active: boolean
          created_at: string
          updated_at: string
          token_expires_at: string
        }[]
      }
      get_safe_mailbox_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          email: string
          provider: string
          server: string
          port: number
          status: string
          created_at: string
          last_sync_at: string
          company_id: string
          has_tokens: boolean
        }[]
      }
      get_user_fakturownia_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          company_name: string
          domain: string
          is_active: boolean
          created_at: string
          updated_at: string
        }[]
      }
      get_user_gmail_connections: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          email: string
          is_active: boolean
          created_at: string
          updated_at: string
          token_expires_at: string
        }[]
      }
      insert_encrypted_fakturownia_connection: {
        Args: {
          p_user_id: string
          p_company_name: string
          p_domain: string
          p_api_token: string
        }
        Returns: string
      }
      insert_encrypted_fakturownia_connection_secure: {
        Args: { p_company_name: string; p_domain: string; p_api_token: string }
        Returns: string
      }
      insert_encrypted_gmail_connection: {
        Args: {
          p_email: string
          p_access_token: string
          p_refresh_token: string
          p_token_expires_at?: string
        }
        Returns: string
      }
      insert_encrypted_gmail_connection_for_user: {
        Args: {
          p_user_id: string
          p_email: string
          p_access_token: string
          p_refresh_token: string
          p_token_expires_at?: string
        }
        Returns: string
      }
      insert_encrypted_gmail_connection_secure: {
        Args: {
          p_email: string
          p_access_token: string
          p_refresh_token: string
          p_token_expires_at?: string
        }
        Returns: string
      }
      insert_encrypted_mailbox_tokens: {
        Args: {
          p_mailbox_id: string
          p_access_token: string
          p_refresh_token?: string
          p_expires_at?: string
        }
        Returns: boolean
      }
      insert_encrypted_mailbox_tokens_secure: {
        Args: {
          p_mailbox_id: string
          p_access_token: string
          p_refresh_token?: string
          p_expires_at?: string
        }
        Returns: boolean
      }
      is_member: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      log_token_access: {
        Args: { p_action: string; p_table_name: string; p_record_id: string }
        Returns: undefined
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
          p_connection_id: string
          p_access_token: string
          p_refresh_token?: string
          p_token_expires_at?: string
        }
        Returns: boolean
      }
      update_encrypted_mailbox_tokens: {
        Args: {
          p_mailbox_id: string
          p_access_token: string
          p_refresh_token?: string
          p_expires_at?: string
        }
        Returns: boolean
      }
      validate_all_tokens_encrypted: {
        Args: Record<PropertyKey, never>
        Returns: {
          table_name: string
          unencrypted_tokens: number
          security_status: string
        }[]
      }
      validate_token_encryption: {
        Args: Record<PropertyKey, never>
        Returns: {
          table_name: string
          has_unencrypted_tokens: boolean
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
