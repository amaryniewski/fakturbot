import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CompanySettings {
  company_id: string;
  auto_import_emails: boolean;
  auto_send_to_ocr: boolean;
  auto_send_to_accounting: boolean;
  updated_at: string;
}

export const useCompanySettings = () => {
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSettings = async () => {
    try {
      setLoading(true);
      
      // First, ensure user has membership in default company
      await supabase.rpc('create_default_membership');
      
      // Use the default company ID
      const mockCompanyId = "00000000-0000-0000-0000-000000000000";
      
      const { data, error } = await supabase
        .from("company_settings")
        .select("*")
        .eq("company_id", mockCompanyId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings(data);
      } else {
        // Create default settings if they don't exist
        const defaultSettings = {
          company_id: mockCompanyId,
          auto_import_emails: false,
          auto_send_to_ocr: false,
          auto_send_to_accounting: false,
        };

        const { data: newSettings, error: insertError } = await supabase
          .from("company_settings")
          .insert(defaultSettings)
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings(newSettings);
      }
    } catch (error: any) {
      console.error("Error fetching company settings:", error);
      toast({
        title: "Błąd",
        description: "Nie można załadować ustawień automatyzacji.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<Pick<CompanySettings, 'auto_import_emails' | 'auto_send_to_ocr' | 'auto_send_to_accounting'>>) => {
    if (!settings) return;

    try {
      const { data, error } = await supabase
        .from("company_settings")
        .update(updates)
        .eq("company_id", settings.company_id)
        .select()
        .single();

      if (error) throw error;

      setSettings(data);
      toast({
        title: "Zapisano",
        description: "Ustawienia automatyzacji zostały zaktualizowane.",
      });
    } catch (error: any) {
      console.error("Error updating company settings:", error);
      toast({
        title: "Błąd",
        description: "Nie można zapisać ustawień automatyzacji.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return {
    settings,
    loading,
    updateSettings,
    refetch: fetchSettings,
  };
};