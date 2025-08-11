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
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', errorText);
        throw new Error('Failed to exchange code for tokens');
      }

      const tokens = await tokenResponse.json();
      console.log('Tokens received, getting user info...');

      // Get user info from Google
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        console.error('Failed to get user info from Google');
        throw new Error('Failed to get user info');
      }

      const userInfo = await userInfoResponse.json();
      console.log('User info received:', userInfo.email);

      // Store connection in database
      const { error: dbError } = await supabase
        .from('gmail_connections')
        .upsert({
          user_id: state,
          email: userInfo.email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          is_active: true,
        }, {
          onConflict: 'user_id,email'
        });

      if (dbError) {
        console.error('Database error:', dbError);
        throw new Error('Failed to save connection');
      }

      console.log('Gmail connection saved successfully');

      // Return success HTML with postMessage to parent window
      const successHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Gmail Connected</title></head>
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
      console.error("Error in gmail-oauth callback:", error);
      
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
            <p>Wystąpił błąd podczas łączenia z Gmail. To okno zostanie zamknięte automatycznie.</p>
          </body>
        </html>
      `;

      return new Response(errorHtml, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }
  }

  // Handle start OAuth flow
  if (req.method === "POST") {
    try {
      const { action } = await req.json();
      
      if (action === 'start') {
        // Get user from JWT token
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
          throw new Error("No authorization header");
        }
        
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const token = authHeader.replace("Bearer ", "");
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        
        if (userError || !user) {
          throw new Error("Unauthorized");
        }

        const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
        const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gmail-oauth`;

        if (!clientId) {
          throw new Error("Google OAuth credentials not configured");
        }

        // Generate OAuth URL
        const scopes = [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/userinfo.email'
        ].join(' ');
        
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: scopes,
          access_type: 'offline',
          prompt: 'consent',
          state: user.id // Use user ID as state
        });

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
        
        console.log('Generated OAuth URL for user:', user.id);
        
        return new Response(JSON.stringify({ authUrl }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      throw new Error('Invalid action');

    } catch (error: any) {
      console.error("Error in gmail-oauth start:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
  }

  // Default response for other methods
  return new Response("Method not allowed", {
    status: 405,
    headers: corsHeaders,
  });
};

serve(handler);