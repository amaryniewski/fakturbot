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
      gmail_connections: {
        Row: {
          access_token: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          refresh_token: string
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
          refresh_token: string
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
          refresh_token?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          error_message: string | null
          file_name: string
          file_size: number | null
          file_url: string | null
          gmail_message_id: string | null
          id: string
          received_at: string
          sender_email: string
          status: string
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_name: string
          file_size?: number | null
          file_url?: string | null
          gmail_message_id?: string | null
          id?: string
          received_at: string
          sender_email: string
          status?: string
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string | null
          gmail_message_id?: string | null
          id?: string
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
          processed_label_id: string | null
          provider: Database["public"]["Enums"]["mail_provider"]
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
          processed_label_id?: string | null
          provider: Database["public"]["Enums"]["mail_provider"]
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
          processed_label_id?: string | null
          provider?: Database["public"]["Enums"]["mail_provider"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_member: {
        Args: { p_company_id: string }
        Returns: boolean
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
