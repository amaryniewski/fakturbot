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
      return true;
    } catch (error: any) {
      console.error('Error connecting IMAP:', error);
      
      // Parse error message for better user experience
      let errorMessage = "Nie udało się połączyć ze skrzynką IMAP";
      
      if (error.message) {
        if (error.message.includes('Gmail wymaga hasła aplikacji')) {
          errorMessage = "Gmail wymaga hasła aplikacji. Włącz uwierzytelnianie dwuskładnikowe i wygeneruj hasło aplikacji w ustawieniach Google.";
        } else if (error.message.includes('Outlook/Hotmail wymaga')) {
          errorMessage = "Sprawdź hasło do konta Outlook/Hotmail.";
        } else if (error.message.includes('Nie można połączyć z serwerem')) {
          errorMessage = "Nie można połączyć z serwerem IMAP. Sprawdź adres serwera i port.";
        } else if (error.message.includes('Mailbox already connected')) {
          errorMessage = "Ta skrzynka jest już połączona.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Błąd połączenia IMAP",
        description: errorMessage,
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (formData: ImapFormData) => {
    setLoading(true);
    try {
      // Test connection without saving
      const { data, error } = await supabase.functions.invoke('imap-connect', {
        body: { ...formData, testOnly: true }
      });

      if (error) throw error;

      toast({
        title: "Test połączenia",
        description: "Połączenie z serwerem IMAP działa prawidłowo!",
      });
      return true;
    } catch (error: any) {
      console.error('Error testing IMAP:', error);
      toast({
        title: "Test nieudany",
        description: error.message || "Nie udało się połączyć z serwerem IMAP",
        variant: "destructive",
      });
      return false;
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
    testConnection,
    refreshConnections: fetchConnections,
  };
};