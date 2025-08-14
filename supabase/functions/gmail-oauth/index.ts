import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  console.log(`Incoming request: ${req.method} ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log('Handling OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  console.log('Request details:', { 
    method: req.method, 
    hasCode: !!code, 
    hasState: !!state, 
    hasError: !!error,
    url: req.url
  });

  // Handle all GET requests as OAuth callbacks (no auth required)
  if (req.method === "GET") {
    // Handle OAuth error from Google
    if (error) {
      console.error('OAuth error from Google:', error);
      const errorHtml = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gmail OAuth - Błąd</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .container {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 40px;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      max-width: 400px;
      width: 90%;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
      animation: shake 0.5s ease-in-out;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
    h1 {
      font-size: 24px;
      margin-bottom: 16px;
      font-weight: 600;
    }
    p {
      font-size: 16px;
      opacity: 0.9;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1>Błąd autoryzacji</h1>
    <p>Wystąpił błąd podczas łączenia z Gmail: ${error}</p>
    <p style="font-size: 14px; margin-top: 20px;">To okno zostanie zamknięte automatycznie...</p>
  </div>
  <script>
    window.opener?.postMessage({
      type: 'gmail-oauth-error',
      error: '${error}'
    }, window.location.origin);
    setTimeout(() => window.close(), 3000);
  </script>
</body>
</html>`;
      return new Response(errorHtml, {
        status: 400,
        headers: { 
          "Content-Type": "text/html; charset=utf-8"
        },
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

        // Store the connection in database using UPSERT pattern
        // This handles both new connections and reactivating previously disconnected ones
        const expiresAt = tokens.expires_in ? 
          new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null;
        
        // Use upsert to handle reconnection scenarios
        const { data: connectionData, error: dbError } = await supabase
          .from('gmail_connections')
          .upsert({
            user_id: state, // state contains user ID
            email: userInfo.email,
            access_token: tokens.access_token, // Will be encrypted by trigger
            refresh_token: tokens.refresh_token || '',
            token_expires_at: expiresAt,
            is_active: true, // Ensure connection is active
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,email',
            ignoreDuplicates: false
          })
          .select('id')
          .single();

        if (dbError) {
          console.error('Database error:', dbError);
          throw new Error(`Database error: ${dbError.message}`);
        }

        // Check if this was a new connection or reactivation
        const { data: existingConnection } = await supabase
          .from('gmail_connections')
          .select('created_at, updated_at')
          .eq('id', connectionData.id)
          .single();
        
        const isReactivation = existingConnection && 
          existingConnection.created_at !== existingConnection.updated_at;
        
        console.log(`Gmail connection ${isReactivation ? 'reactivated' : 'created'} with ID:`, 
          connectionData.id, `for email: ${userInfo.email}`);

        const successHtml = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gmail OAuth - Sukces</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .container {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 40px;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      max-width: 400px;
      width: 90%;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
      animation: bounce 1s ease-in-out;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    h1 {
      font-size: 24px;
      margin-bottom: 16px;
      font-weight: 600;
    }
    p {
      font-size: 16px;
      opacity: 0.9;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .email {
      background: rgba(255, 255, 255, 0.2);
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 500;
      margin: 16px 0;
    }
    .loading {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 1s ease-in-out infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✉️</div>
    <h1>Gmail połączony pomyślnie!</h1>
    <div class="email">${userInfo.email}</div>
    <p>Twoje konto Gmail zostało pomyślnie połączone z FakturBot. Możesz teraz automatycznie importować faktury z swojej skrzynki pocztowej.</p>
    <div class="loading"></div>
    <p style="font-size: 14px; margin-top: 16px;">To okno zostanie zamknięte automatycznie...</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: 'gmail-oauth-success',
        email: '${userInfo.email}'
      }, '*');
    }
    setTimeout(function() { window.close(); }, 2000);
  </script>
</body>
</html>`;

        return new Response(successHtml, {
          status: 200,
          headers: { 
            "Content-Type": "text/html; charset=utf-8"
          },
        });

      } catch (error: any) {
        console.error('Error processing OAuth callback:', error);
        
        const errorHtml = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gmail OAuth - Błąd</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .container {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      padding: 40px;
      text-align: center;
      border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      max-width: 400px;
      width: 90%;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 20px;
      animation: shake 0.5s ease-in-out;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }
    h1 {
      font-size: 24px;
      margin-bottom: 16px;
      font-weight: 600;
    }
    p {
      font-size: 16px;
      opacity: 0.9;
      line-height: 1.5;
      margin-bottom: 12px;
    }
    .error-details {
      background: rgba(255, 255, 255, 0.2);
      padding: 12px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 14px;
      margin: 16px 0;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">⚠️</div>
    <h1>Wystąpił błąd</h1>
    <p>Nie udało się połączyć z Gmail. Spróbuj ponownie.</p>
    <div class="error-details">${error.message}</div>
    <p style="font-size: 14px;">To okno zostanie zamknięte automatycznie...</p>
  </div>
  <script>
    window.opener?.postMessage({
      type: 'gmail-oauth-error',
      error: '${error.message}'
    }, window.location.origin);
    setTimeout(() => window.close(), 4000);
  </script>
</body>
</html>`;

        return new Response(errorHtml, {
          status: 500,
          headers: { 
            "Content-Type": "text/html; charset=utf-8"
          },
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