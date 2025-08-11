import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GmailConnection {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
}

export const useGmailIntegration = () => {
  const [connections, setConnections] = useState<GmailConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchConnections = async () => {
    try {
      // Use secure function that doesn't expose OAuth tokens
      const { data, error } = await supabase.rpc('get_user_gmail_connections');

      if (error) throw error;
      setConnections(data || []);
    } catch (error: any) {
      console.error('Error fetching Gmail connections:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się pobrać połączeń Gmail",
        variant: "destructive",
      });
    }
  };

  const connectGmail = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-oauth', {
        body: { action: 'start' }
      });

      if (error) throw error;

      if (data?.authUrl) {
        // Open OAuth popup - standardowy SaaS flow
        const popup = window.open(
          data.authUrl,
          'gmail-oauth',
          'width=500,height=600,left=' + (window.screen.width / 2 - 250) + ',top=' + (window.screen.height / 2 - 300)
        );

        if (!popup) {
          throw new Error("Nie udało się otworzyć okna autoryzacji. Sprawdź blokadę popup'ów.");
        }

        // Listen for popup messages from OAuth callback
        const messageListener = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;
          
          if (event.data.type === 'gmail-oauth-success') {
            popup?.close();
            window.removeEventListener('message', messageListener);
            
            toast({
              title: "Gmail połączony",
              description: `Pomyślnie połączono konto: ${event.data.email}`,
            });
            
            fetchConnections();
            setLoading(false);
          } else if (event.data.type === 'gmail-oauth-error') {
            popup?.close();
            window.removeEventListener('message', messageListener);
            
            toast({
              title: "Błąd autoryzacji",
              description: event.data.error || "Nie udało się połączyć z Gmail",
              variant: "destructive",
            });
            setLoading(false);
          }
        };

        window.addEventListener('message', messageListener);

        // Handle popup closed manually (user cancellation)
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
            setLoading(false);
          }
        }, 1000);
      }
    } catch (error: any) {
      console.error('Error connecting Gmail:', error);
      toast({
        title: "Błąd",
        description: error.message || "Nie udało się rozpocząć autoryzacji Gmail",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const disconnectGmail = async (connectionId: string) => {
    try {
      // Securely disable the connection by setting is_active to false
      const { error } = await supabase
        .from('gmail_connections')
        .update({ is_active: false })
        .eq('id', connectionId);

      if (error) throw error;

      toast({
        title: "Rozłączono",
        description: "Połączenie Gmail zostało usunięte",
      });

      fetchConnections();
    } catch (error: any) {
      console.error('Error disconnecting Gmail:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się rozłączyć Gmail",
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
    connectGmail,
    disconnectGmail,
    refreshConnections: fetchConnections,
  };
};