import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  console.log('Gmail OAuth callback received:', { code: !!code, state, error });

  // Handle OAuth callback from Google (GET request - no auth required)
  if (req.method === "GET" && (code || error)) {
    // Handle OAuth error from Google
    if (error) {
      console.error('OAuth error from Google:', error);
      const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Gmail OAuth Error</title></head>
          <body>
            <script>
              window.opener?.postMessage({
                type: 'gmail-oauth-error',
                error: '${error}'
              }, window.location.origin);
              window.close();
            </script>
            <p>Błąd autoryzacji. To okno zostanie zamknięte automatycznie.</p>
          </body>
        </html>
      `;
      return new Response(errorHtml, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    // Handle OAuth callback from Google
    if (code && state) {
      try {
        console.log('Processing OAuth callback with code and state');
        
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
        const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
        const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-oauth`;

        if (!clientId || !clientSecret) {
          throw new Error("Google OAuth credentials not configured");
        }

        console.log('Exchanging code for tokens...');
        
        // Exchange code for tokens
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          console.error('Token exchange failed:', errorText);
          throw new Error(`Token exchange failed: ${errorText}`);
        }

        const tokens = await tokenResponse.json();
        console.log('Tokens received successfully');

        // Get user email from Google
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!userInfoResponse.ok) {
          throw new Error('Failed to get user info from Google');
        }

        const userInfo = await userInfoResponse.json();
        console.log('User info received:', { email: userInfo.email });

        // Store the connection in database using the user_id from state
        const { data: connectionData, error: dbError } = await supabase.rpc('insert_encrypted_gmail_connection_for_user', {
          p_user_id: state, // state contains user ID
          p_email: userInfo.email,
          p_access_token: tokens.access_token,
          p_refresh_token: tokens.refresh_token || '',
          p_token_expires_at: tokens.expires_in ? 
            new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null
        });

        if (dbError) {
          console.error('Database error:', dbError);
          throw new Error(`Database error: ${dbError.message}`);
        }

        console.log('Gmail connection stored with ID:', connectionData);

        const successHtml = `
          <!DOCTYPE html>
          <html>
            <head><title>Gmail OAuth Success</title></head>
            <body>
              <script>
                window.opener?.postMessage({
                  type: 'gmail-oauth-success',
                  email: '${userInfo.email}'
                }, window.location.origin);
                window.close();
              </script>
              <p>Gmail został pomyślnie połączony! To okno zostanie zamknięte automatycznie.</p>
            </body>
          </html>
        `;

        return new Response(successHtml, {
          headers: { "Content-Type": "text/html", ...corsHeaders },
        });

      } catch (error: any) {
        console.error('Error processing OAuth callback:', error);
        
        const errorHtml = `
          <!DOCTYPE html>
          <html>
            <head><title>Gmail OAuth Error</title></head>
            <body>
              <script>
                window.opener?.postMessage({
                  type: 'gmail-oauth-error',
                  error: '${error.message}'
                }, window.location.origin);
                window.close();
              </script>
              <p>Wystąpił błąd: ${error.message}</p>
            </body>
          </html>
        `;

        return new Response(errorHtml, {
          headers: { "Content-Type": "text/html", ...corsHeaders },
          status: 500,
        });
      }
    }
  }

  // Handle start OAuth flow (POST request - requires auth)
  if (req.method === "POST") {
    try {
      const { action } = await req.json();
      
      if (action === 'start') {
        // Get user from JWT token
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
          return new Response(
            JSON.stringify({ error: "Missing authorization header" }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
              status: 401,
            }
          );
        }
        
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        
        if (userError || !user) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
              status: 401,
            }
          );
        }

        const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
        const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-oauth`;

        if (!clientId) {
          throw new Error("Google Client ID not configured");
        }

        // Generate OAuth URL
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email openid');
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'consent');
        authUrl.searchParams.set('state', user.id); // Use user ID as state

        console.log('Generated OAuth URL for user:', user.id);

        return new Response(
          JSON.stringify({ authUrl: authUrl.toString() }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
            status: 200,
          }
        );
      }
    } catch (error: any) {
      console.error('Error starting OAuth flow:', error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 400,
        }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: "Method not allowed" }),
    {
      headers: { "Content-Type": "application/json", ...corsHeaders },
      status: 405,
    }
  );
};

serve(handler);