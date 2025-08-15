import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // autoryzacja webhooka n8n prostym sekretem
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== Deno.env.get('N8N_OCR_WEBHOOK_SECRET')) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.invoices) ? body.invoices : [];

    if (!items.length) {
      return new Response(JSON.stringify({ error: 'no invoices' }), { status: 400, headers: corsHeaders });
    }

    for (const it of items) {
      const id = it.id;
      const data = it.data || {};
      if (!id) continue;

      const conf = typeof data.confidence === 'number' ? data.confidence : null;
      const needsReview = conf == null ? true : conf < 0.8;

      const { error } = await supabase
        .from('invoices')
        .update({
          extracted_data: data,
          confidence_score: conf,
          status: 'success',
          needs_review: needsReview,
          ocr_provider: 'n8n'
        })
        .eq('id', id);

      if (error) console.error('Update failed for', id, error);
    }

    return new Response(JSON.stringify({ ok: true, updated: items.length }), { 
      status: 200, 
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });

  } catch (error: any) {
    console.error("Error in ocr-webhook function:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);