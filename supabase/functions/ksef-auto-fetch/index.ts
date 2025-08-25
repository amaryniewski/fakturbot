// supabase/functions/ksef-auto-fetch/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { anonymizeForLogs } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // POPRAWKA: Używamy SERVICE_ROLE_KEY dla automatycznych operacji
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting automatic KSeF fetch process...');

    // Get all active configurations with auto_fetch enabled
    const { data: configs, error: configError } = await supabaseClient
      .from('ksef_config')
      .select('*')
      .eq('is_active', true)
      .eq('auto_fetch', true);

    if (configError) {
      throw configError;
    }

    console.log(`Found ${configs?.length || 0} active auto-fetch configurations`);

    const results = [];

    for (const config of configs || []) {
      try {
        // Check if enough time has passed since last fetch
        const lastFetch = config.last_fetch_timestamp ? new Date(config.last_fetch_timestamp) : null;
        const now = new Date();
        const intervalMs = config.fetch_interval_minutes * 60 * 1000;

        if (lastFetch && (now.getTime() - lastFetch.getTime()) < intervalMs) {
          console.log(`Skipping fetch for user ${anonymizeForLogs(config.user_id)} - interval not reached`);
          continue;
        }

        console.log(`Triggering fetch for user ${anonymizeForLogs(config.user_id)}`);

        // Trigger fetch for this configuration using service role
        const fetchResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/ksef-fetch`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            connectionId: config.id,
            subjectType: 'subject1' // Default to received invoices
          })
        });

        const fetchResult = await fetchResponse.json();
        
        results.push({
          userId: anonymizeForLogs(config.user_id),
          configId: config.id,
          success: fetchResult.success,
          newInvoices: fetchResult.data?.newInvoices || 0,
          error: fetchResult.error
        });

        console.log(`Fetch completed for user ${anonymizeForLogs(config.user_id)}: ${fetchResult.success ? 'success' : 'failed'}`);

      } catch (error) {
        console.error(`Error processing config ${config.id}:`, anonymizeForLogs(error));
        results.push({
          userId: anonymizeForLogs(config.user_id),
          configId: config.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log(`Auto-fetch process completed. Processed ${results.length} configurations`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results: results.map(r => ({
          ...r,
          userId: '[REDACTED]' // Don't expose user IDs in response
        }))
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Auto-fetch error:', anonymizeForLogs(error));
    
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