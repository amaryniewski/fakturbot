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

        // Create FormData with PDF file and metadata
        const formData = new FormData();
        
        // Add the PDF file
        const blob = new Blob([fileBuffer], { type: 'application/pdf' });
        formData.append('file', blob, invoice.file_name);
        
        // Add metadata as JSON
        const metadata = {
          invoice_id: invoice.id,
          file_name: invoice.file_name,
          sender_email: invoice.sender_email,
          subject: invoice.subject,
          received_at: invoice.received_at,
          approved_at: invoice.approved_at,
          approved_by: invoice.approved_by,
          file_size: invoice.file_size
        };
        
        formData.append('metadata', JSON.stringify(metadata));
        
        console.log(`Sending ${invoice.file_name} to webhook...`);
        
        // Send to N8N webhook
        const webhookResponse = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "User-Agent": "FakturBot/1.0",
          },
          body: formData
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