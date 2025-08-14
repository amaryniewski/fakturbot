import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendToN8nRequest {
  invoiceIds: string[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("send-to-n8n function called");
    const { invoiceIds }: SendToN8nRequest = await req.json();
    console.log("Received invoiceIds:", invoiceIds);
    
    if (!invoiceIds || invoiceIds.length === 0) {
      throw new Error("No invoice IDs provided");
    }

    // Get webhook URL from Supabase secrets
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    console.log("N8N_WEBHOOK_URL exists:", !!webhookUrl);
    
    if (!webhookUrl) {
      throw new Error("N8N webhook URL not configured in Supabase secrets");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get invoice details
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .in('id', invoiceIds);

    if (error) {
      throw error;
    }

    if (!invoices || invoices.length === 0) {
      throw new Error("No invoices found");
    }

    console.log("Processing invoices for n8n webhook");
    
    // Process each invoice and send to n8n
    const results = [];
    
    for (const invoice of invoices) {
      try {
        console.log(`Processing invoice: ${invoice.file_name}`);
        
        // Fetch the PDF file from Supabase Storage
        const fileResponse = await fetch(invoice.file_url);
        if (!fileResponse.ok) {
          throw new Error(`Failed to fetch file: ${fileResponse.statusText}`);
        }
        
        const fileBlob = await fileResponse.blob();
        console.log(`File fetched: ${invoice.file_name}, size: ${fileBlob.size} bytes`);
        
        // Prepare FormData for n8n webhook
        const formData = new FormData();
        formData.append('data', fileBlob, invoice.file_name);
        formData.append('userId', invoice.user_id);
        formData.append('invoiceId', invoice.id);
        formData.append('fileName', invoice.file_name);
        formData.append('source', 'email');
        formData.append('timestamp', new Date().toISOString());
        
        console.log(`Sending file to n8n webhook: ${invoice.file_name}`);
        
        // Send to n8n webhook
        const webhookResponse = await fetch(webhookUrl, {
          method: "POST",
          body: formData,
        });
        
        console.log(`Webhook response for ${invoice.file_name}: ${webhookResponse.status}`);
        
        if (!webhookResponse.ok) {
          const errorText = await webhookResponse.text();
          console.error(`Webhook failed for ${invoice.file_name}:`, errorText);
          throw new Error(`Webhook request failed: ${webhookResponse.status} ${webhookResponse.statusText}`);
        }
        
        const result = await webhookResponse.text();
        console.log(`Webhook success for ${invoice.file_name}:`, result);
        
        results.push({
          invoiceId: invoice.id,
          fileName: invoice.file_name,
          success: true,
          result: result
        });
        
      } catch (error: any) {
        console.error(`Error processing invoice ${invoice.file_name}:`, error);
        results.push({
          invoiceId: invoice.id,
          fileName: invoice.file_name,
          success: false,
          error: error.message
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      processed_invoices: results.length,
      results: results
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error in send-to-n8n function:", error);
    console.error("Error stack:", error.stack);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);