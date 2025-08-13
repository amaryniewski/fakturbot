import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UserAutomationSettings {
  user_id: string;
  auto_import_emails: boolean;
  auto_send_to_ocr: boolean;
  auto_send_to_accounting: boolean;
  updated_at: string;
}

export const useCompanySettings = () => {
  const [settings, setSettings] = useState<UserAutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchSettings = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("user_automation_settings")
        .select("*")
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings(data);
      } else {
        // Create default settings if they don't exist
        const { data: newSettings, error: insertError } = await supabase
          .from("user_automation_settings")
          .insert({
            user_id: (await supabase.auth.getUser()).data.user?.id,
            auto_import_emails: false,
            auto_send_to_ocr: false,
            auto_send_to_accounting: false,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings(newSettings);
      }
    } catch (error: any) {
      console.error("Error fetching automation settings:", error);
      toast({
        title: "Błąd",
        description: "Nie można załadować ustawień automatyzacji.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<Pick<UserAutomationSettings, 'auto_import_emails' | 'auto_send_to_ocr' | 'auto_send_to_accounting'>>) => {
    if (!settings) return;

    try {
      const { data, error } = await supabase
        .from("user_automation_settings")
        .update(updates)
        .eq("user_id", settings.user_id)
        .select()
        .single();

      if (error) throw error;

      setSettings(data);
      toast({
        title: "Zapisano",
        description: "Ustawienia automatyzacji zostały zaktualizowane.",
      });
    } catch (error: any) {
      console.error("Error updating automation settings:", error);
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