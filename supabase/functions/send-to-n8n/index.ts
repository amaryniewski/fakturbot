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
    console.log("=== SEND-TO-N8N FUNCTION START ===");
    const { invoiceIds }: SendToN8nRequest = await req.json();
    console.log("Received invoiceIds:", invoiceIds);
    
    if (!invoiceIds || invoiceIds.length === 0) {
      console.error("ERROR: No invoice IDs provided");
      throw new Error("No invoice IDs provided");
    }

    // Get webhook URL from Supabase secrets
    console.log("=== CHECKING ENVIRONMENT VARIABLES ===");
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    console.log("N8N_WEBHOOK_URL found:", !!webhookUrl);
    console.log("N8N_WEBHOOK_URL value (first 50 chars):", webhookUrl ? webhookUrl.substring(0, 50) + "..." : "NOT FOUND");
    
    if (!webhookUrl) {
      console.error("ERROR: N8N_WEBHOOK_URL not found in environment");
      return new Response(JSON.stringify({ 
        error: "N8N webhook URL not configured in Supabase secrets",
        success: false 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("=== INITIALIZING SUPABASE CLIENT ===");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("SUPABASE_URL found:", !!supabaseUrl);
    console.log("SUPABASE_SERVICE_ROLE_KEY found:", !!supabaseKey);

    const supabase = createClient(
      supabaseUrl ?? "",
      supabaseKey ?? ""
    );

    console.log("=== FETCHING INVOICES FROM DATABASE ===");
    // Get invoice details
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .in('id', invoiceIds);

    if (error) {
      console.error("Database error:", error);
      throw error;
    }

    if (!invoices || invoices.length === 0) {
      console.error("No invoices found for IDs:", invoiceIds);
      throw new Error("No invoices found");
    }

    console.log(`Processing ${invoices.length} invoices`);

    // Process each invoice - download PDF and send to webhook
    const results = [];
    
    for (const invoice of invoices) {
      try {
        console.log(`Processing invoice: ${invoice.file_name}`);
        
        if (!invoice.file_url) {
          console.error(`No file URL for invoice: ${invoice.id}`);
          results.push({ 
            invoiceId: invoice.id, 
            status: 'error', 
            error: 'No file URL' 
          });
          continue;
        }

        // Download PDF file from Supabase Storage
        console.log(`Downloading file from: ${invoice.file_url}`);
        const fileResponse = await fetch(invoice.file_url);
        
        if (!fileResponse.ok) {
          throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`);
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        console.log(`Downloaded file size: ${fileBuffer.byteLength} bytes`);

        console.log(`Sending ${invoice.file_name} as binary data to webhook...`);
        
        // Send raw PDF binary data to N8N webhook
        const webhookResponse = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/pdf",
            "User-Agent": "FakturBot/1.0",
            "X-Invoice-ID": invoice.id,
            "X-File-Name": invoice.file_name,
            "X-Sender-Email": invoice.sender_email,
          },
          body: fileBuffer
        });

        console.log(`Webhook response for ${invoice.file_name}: ${webhookResponse.status}`);
        
        if (!webhookResponse.ok) {
          const errorText = await webhookResponse.text();
          console.error(`Webhook error for ${invoice.file_name}:`, errorText);
          results.push({ 
            invoiceId: invoice.id, 
            status: 'error', 
            error: `Webhook error: ${webhookResponse.status}` 
          });
        } else {
          const responseText = await webhookResponse.text();
          console.log(`Webhook success for ${invoice.file_name}:`, responseText);
          results.push({ 
            invoiceId: invoice.id, 
            status: 'success',
            webhook_response: responseText
          });
        }

      } catch (invoiceError: any) {
        console.error(`Error processing invoice ${invoice.id}:`, invoiceError);
        results.push({ 
          invoiceId: invoice.id, 
          status: 'error', 
          error: invoiceError.message 
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`Completed: ${successCount} success, ${errorCount} errors`);

    return new Response(JSON.stringify({ 
      success: true,
      processed_invoices: invoices.length,
      successful_sends: successCount,
      failed_sends: errorCount,
      results: results
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error in send-to-n8n function:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);