import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FakturowniaConnection {
  id: string;
  company_name: string;
  domain: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ConnectFakturowniaData {
  companyName: string;
  domain: string;
  apiToken: string;
}

export const useFakturowniaIntegration = () => {
  const [connections, setConnections] = useState<FakturowniaConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchConnections = async () => {
    try {
      // Use secure function that doesn't expose API tokens
      const { data, error } = await supabase.rpc('get_user_fakturownia_connections');

      if (error) throw error;
      setConnections(data || []);
    } catch (error: any) {
      console.error('Error fetching Fakturownia connections:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się pobrać połączeń z Fakturownia",
        variant: "destructive",
      });
    }
  };

  const connectFakturownia = async ({ companyName, domain, apiToken }: ConnectFakturowniaData) => {
    setLoading(true);
    try {
      // Use Edge Function to test and save connection securely
      const { data, error } = await supabase.functions.invoke('fakturownia-api', {
        body: { 
          action: 'connect', 
          companyName,
          domain,
          apiToken 
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Błąd połączenia z Edge Function');
      }

      if (!data.success) {
        throw new Error('Nieprawidłowy token API lub domena');
      }

      toast({
        title: "Fakturownia połączona",
        description: `Pomyślnie połączono z kontem: ${data.accountName}`,
      });

      fetchConnections();
    } catch (error: any) {
      console.error('Error connecting Fakturownia:', error);
      toast({
        title: "Błąd połączenia",
        description: error.message || "Nie udało się połączyć z Fakturownia",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const disconnectFakturownia = async (connectionId: string) => {
    try {
      const { error } = await supabase
        .from('fakturownia_connections')
        .update({ is_active: false })
        .eq('id', connectionId);

      if (error) throw error;

      toast({
        title: "Rozłączono",
        description: "Połączenie Fakturownia zostało usunięte",
      });

      fetchConnections();
    } catch (error: any) {
      console.error('Error disconnecting Fakturownia:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się rozłączyć Fakturownia",
        variant: "destructive",
      });
    }
  };

  const syncInvoices = async (connectionId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fakturownia-api', {
        body: { 
          action: 'sync_invoices', 
          connectionId 
        }
      });

      if (error) throw error;

      toast({
        title: "Synchronizacja zakończona",
        description: `Zsynchronizowano ${data?.count || 0} faktur`,
      });
    } catch (error: any) {
      console.error('Error syncing invoices:', error);
      toast({
        title: "Błąd synchronizacji",
        description: error.message || "Nie udało się zsynchronizować faktur",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  return {
    connections,
    loading,
    connectFakturownia,
    disconnectFakturownia,
    syncInvoices,
    refreshConnections: fetchConnections,
  };
};