import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface N8nOCRRequest {
  invoiceId?: string;
  invoiceUrl: string;
  userId: string;
}

interface N8nOCRResponse {
  extractedData: any;
  structuredData?: {
    vendor_name?: string;
    vendor_nip?: string;
    buyer_name?: string;
    buyer_nip?: string;
    total_net?: number;
    total_vat?: number;
    total_gross?: number;
    items?: Array<{
      item_name: string;
      quantity?: number;
      unit_price?: number;
      net_amount?: number;
      vat_rate?: number;
      vat_amount?: number;
      gross_amount?: number;
    }>;
  };
}

export default async function handler(req: Request): Promise<Response> {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL');

    if (!supabaseUrl || !supabaseServiceKey || !n8nWebhookUrl) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const requestData: N8nOCRRequest = await req.json();
    const { invoiceId, invoiceUrl, userId } = requestData;

    if (!invoiceUrl || !userId) {
      throw new Error('Missing required parameters: invoiceUrl and userId');
    }

    console.log('Processing OCR via n8n for user:', userId, 'invoice:', invoiceId);

    // Call n8n webhook with invoice data
    const n8nResponse = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        invoiceId: invoiceId,
        invoiceUrl: invoiceUrl,
        source: 'supabase-ocr-processor'
      })
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('n8n webhook error:', errorText);
      throw new Error(`n8n webhook failed: ${n8nResponse.status}`);
    }

    const n8nResult = await n8nResponse.json();
    console.log('n8n OCR result:', n8nResult);

    // Structure the response to be compatible with existing system
    const response: N8nOCRResponse = {
      extractedData: n8nResult.extractedData || n8nResult,
      structuredData: n8nResult.structuredData
    };

    // If we have invoice ID, update the invoice with structured data
    if (invoiceId && response.structuredData) {
      const { data: invoiceUpdateResult, error: updateError } = await supabase
        .from('invoices')
        .update({
          vendor_name: response.structuredData.vendor_name,
          vendor_nip: response.structuredData.vendor_nip,
          buyer_name: response.structuredData.buyer_name,
          buyer_nip: response.structuredData.buyer_nip,
          total_net: response.structuredData.total_net,
          total_vat: response.structuredData.total_vat,
          total_gross: response.structuredData.total_gross,
          ocr_provider: 'n8n',
          extracted_data: response.extractedData
        })
        .eq('id', invoiceId)
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error updating invoice:', updateError);
      }

      // Save invoice items if available
      if (response.structuredData.items && response.structuredData.items.length > 0) {
        const invoiceItems = response.structuredData.items.map(item => ({
          invoice_id: invoiceId,
          user_id: userId,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          net_amount: item.net_amount,
          vat_rate: item.vat_rate,
          vat_amount: item.vat_amount,
          gross_amount: item.gross_amount
        }));

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(invoiceItems);

        if (itemsError) {
          console.error('Error saving invoice items:', itemsError);
        }
      }
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in n8n-ocr-processor:', error);
    
    return new Response(JSON.stringify({ 
      error: error.message,
      extractedData: null
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}