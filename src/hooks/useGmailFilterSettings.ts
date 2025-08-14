import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GmailFilterSettings {
  id?: string;
  filter_query: string;
  allowed_sender_emails: string[] | null;
}

export const useGmailFilterSettings = () => {
  const [settings, setSettings] = useState<GmailFilterSettings>({
    filter_query: 'has:attachment subject:invoice OR subject:faktura OR subject:fakturę OR subject:faktury',
    allowed_sender_emails: null
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('gmail_filter_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') { // Not found error is ok
        throw error;
      }

      if (data) {
        setSettings(data);
      }
    } catch (error: any) {
      console.error('Error fetching filter settings:', error);
    }
  };

  const saveSettings = async (newSettings: GmailFilterSettings) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('gmail_filter_settings')
        .upsert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          filter_query: newSettings.filter_query,
          allowed_sender_emails: newSettings.allowed_sender_emails
        });

      if (error) throw error;

      setSettings(newSettings);
      toast({
        title: "Zapisano",
        description: "Ustawienia filtrów zostały zapisane",
      });
    } catch (error: any) {
      console.error('Error saving filter settings:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się zapisać ustawień",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return {
    settings,
    loading,
    saveSettings,
    refreshSettings: fetchSettings,
  };
};