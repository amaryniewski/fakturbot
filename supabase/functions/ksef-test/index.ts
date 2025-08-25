// supabase/functions/ksef-test/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { KSeFClient } from '../_shared/ksef-client.ts';
import { getKSeFApiUrl } from '../_shared/ksef-urls.ts';
import { decryptAesGcm, anonymizeForLogs } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // POPRAWKA: Używamy SUPABASE_ANON_KEY + JWT użytkownika
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { connectionId } = await req.json();

    if (!connectionId) {
      throw new Error('Missing connectionId');
    }

    console.log(`Testing KSeF connection for user: ${anonymizeForLogs(user.id)}`);

    const { data: config } = await supabaseClient
      .from('ksef_config')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();

    if (!config) {
      throw new Error('Configuration not found');
    }

    const encryptionKey = Deno.env.get('KSEF_ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const decryptedToken = await decryptAesGcm(config.token_encrypted, encryptionKey);
    const baseUrl = getKSeFApiUrl(config.environment);

    const ksefClient = new KSeFClient({
      nip: config.nip,
      token: decryptedToken,
      baseUrl,
      sessionHeaderType: 'bearer',
      timeout: 15000 // 15 sekund dla testu
    });

    // Test basic connection
    console.log('Testing basic API connection...');
    const connectionTest = await ksefClient.testConnection();
    if (!connectionTest) {
      throw new Error('Failed to connect to KSeF API');
    }

    // Test session initialization
    console.log('Testing session initialization...');
    const session = await ksefClient.initSessionToken();
    
    // Close session immediately after test
    await ksefClient.closeSession();

    console.log(`Connection test successful for environment: ${config.environment}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          connection: true,
          session: true,
          environment: config.environment,
          nip: anonymizeForLogs(config.nip),
          apiUrl: baseUrl
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('KSeF connection test failed:', anonymizeForLogs(error));
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});