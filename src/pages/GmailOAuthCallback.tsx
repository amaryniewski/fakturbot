import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const GmailOAuthCallback = () => {
  useEffect(() => {
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');

        if (error) {
          throw new Error(error);
        }

        if (code && state) {
          const { data, error: callbackError } = await supabase.functions.invoke('gmail-oauth', {
            body: { action: 'callback', code, state }
          });

          if (callbackError) throw callbackError;

          // Send success message to parent window
          window.opener?.postMessage({
            type: 'gmail-oauth-success',
            email: data.email
          }, window.location.origin);
        } else {
          throw new Error('Missing code or state parameter');
        }
      } catch (err: any) {
        console.error('OAuth callback error:', err);
        
        // Send error message to parent window
        window.opener?.postMessage({
          type: 'gmail-oauth-error',
          error: err.message
        }, window.location.origin);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold mb-4">Łączenie z Gmail...</h1>
        <p className="text-muted-foreground">
          Przetwarzamy autoryzację. To okno zostanie zamknięte automatycznie.
        </p>
      </div>
    </div>
  );
};

export default GmailOAuthCallback;