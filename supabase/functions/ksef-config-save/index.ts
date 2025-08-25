// supabase/functions/ksef-config-save/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encryptAesGcm, anonymizeForLogs } from '../_shared/crypto.ts';
import { validateNip, validateKSeFToken } from '../_shared/ksef-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SaveConfigRequest {
  id?: string; // Dla aktualizacji istniejącej konfiguracji
  environment: 'test' | 'production';
  nip: string;
  token: string; // Plain text token - będzie zaszyfrowany
  auto_fetch: boolean;
  fetch_interval_minutes: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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

    const requestData: SaveConfigRequest = await req.json();
    const { id, environment, nip, token, auto_fetch, fetch_interval_minutes } = requestData;

    console.log(`Saving KSeF config for user: ${anonymizeForLogs(user.id)}`);

    // Walidacja danych
    if (!validateNip(nip)) {
      throw new Error('Invalid NIP format - must be exactly 10 digits');
    }

    if (!validateKSeFToken(token)) {
      throw new Error('Invalid token format');
    }

    if (!['test', 'production'].includes(environment)) {
      throw new Error('Invalid environment - must be test or production');
    }

    if (![15, 30, 60, 120, 240, 480, 720, 1440].includes(fetch_interval_minutes)) {
      throw new Error('Invalid fetch interval');
    }

    // Pobierz klucz szyfrowania
    const encryptionKey = Deno.env.get('KSEF_ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    // POPRAWKA: Szyfrowanie tokenu po stronie serwera
    const tokenEncrypted = await encryptAesGcm(token, encryptionKey);

    const configData = {
      user_id: user.id,
      environment,
      nip,
      token_encrypted: tokenEncrypted,
      auto_fetch,
      fetch_interval_minutes,
      updated_at: new Date().toISOString()
    };

    let result;
    if (id) {
      // Aktualizacja istniejącej konfiguracji
      result = await supabaseClient
        .from('ksef_config')
        .update(configData)
        .eq('id', id)
        .eq('user_id', user.id) // Dodatkowe zabezpieczenie
        .select()
        .single();
    } else {
      // Tworzenie nowej konfiguracji
      result = await supabaseClient
        .from('ksef_config')
        .insert({
          ...configData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();
    }

    if (result.error) {
      throw new Error(`Database error: ${result.error.message}`);
    }

    console.log(`KSeF config saved successfully: ${result.data.id}`);

    // Zwróć konfigurację bez zaszyfrowanego tokenu
    const { token_encrypted, ...safeConfig } = result.data;

    return new Response(
      JSON.stringify({
        success: true,
        data: safeConfig
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Failed to save KSeF config:', anonymizeForLogs(error));
    
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