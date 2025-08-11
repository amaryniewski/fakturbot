import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ImapConnection {
  id: string;
  email: string;
  server: string;
  port: number;
  is_active: boolean;
  created_at: string;
}

interface ImapFormData {
  email: string;
  password: string;
  server: string;
  port: number;
  secure: boolean;
}

export const useImapIntegration = () => {
  const [connections, setConnections] = useState<ImapConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchConnections = async () => {
    try {
      const { data, error } = await supabase
        .from('mailboxes')
        .select('id, email, server, port, status, created_at')
        .eq('provider', 'imap')
        .eq('status', 'active');

      if (error) throw error;
      setConnections(data?.map(item => ({
        id: item.id,
        email: item.email,
        server: item.server || '',
        port: item.port || 993,
        is_active: item.status === 'active',
        created_at: item.created_at
      })) || []);
    } catch (error: any) {
      console.error('Error fetching IMAP connections:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się pobrać połączeń IMAP",
        variant: "destructive",
      });
    }
  };

  const connectImap = async (formData: ImapFormData) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('imap-connect', {
        body: formData
      });

      if (error) throw error;

      toast({
        title: "IMAP połączony",
        description: `Pomyślnie połączono skrzynkę: ${formData.email}`,
      });

      // Refresh connections immediately
      await fetchConnections();
    } catch (error: any) {
      console.error('Error connecting IMAP:', error);
      toast({
        title: "Błąd",
        description: error.message || "Nie udało się połączyć ze skrzynką IMAP",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const disconnectImap = async (connectionId: string) => {
    try {
      const { error } = await supabase
        .from('mailboxes')
        .update({ status: 'inactive' })
        .eq('id', connectionId);

      if (error) throw error;

      toast({
        title: "Rozłączono",
        description: "Połączenie IMAP zostało usunięte",
      });

      fetchConnections();
    } catch (error: any) {
      console.error('Error disconnecting IMAP:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się rozłączyć IMAP",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  return {
    connections,
    loading,
    connectImap,
    disconnectImap,
    refreshConnections: fetchConnections,
  };
};