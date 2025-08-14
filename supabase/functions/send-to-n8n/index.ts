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
  console.log("=== SEND-TO-N8N FUNCTION START ===");
  console.log("Method:", req.method);
  console.log("URL:", req.url);
  
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== Reading request body ===");
    const body = await req.text();
    console.log("Raw body:", body);
    
    let requestData: SendToN8nRequest;
    try {
      requestData = JSON.parse(body);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      throw new Error(`Invalid JSON in request body: ${parseError.message}`);
    }
    
    const { invoiceIds } = requestData;
    console.log("Parsed invoiceIds:", invoiceIds);
    
    if (!invoiceIds || invoiceIds.length === 0) {
      throw new Error("No invoice IDs provided");
    }

    console.log("=== Checking environment variables ===");
    const allEnvKeys = Object.keys(Deno.env.toObject());
    console.log("Available env keys:", allEnvKeys.filter(key => key.includes('N8N') || key.includes('SUPABASE')));
    
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    console.log("N8N_WEBHOOK_URL exists:", !!webhookUrl);
    console.log("N8N_WEBHOOK_URL length:", webhookUrl?.length || 0);
    
    if (!webhookUrl) {
      throw new Error("N8N webhook URL not configured in Supabase secrets");
    }
    
    // Validate URL format
    try {
      const url = new URL(webhookUrl);
      console.log("Webhook URL protocol:", url.protocol);
      console.log("Webhook URL host:", url.host);
    } catch (urlError) {
      console.error("Invalid webhook URL:", urlError);
      throw new Error(`Invalid webhook URL format: ${urlError.message}`);
    }

    console.log("=== Creating Supabase client ===");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("SUPABASE_URL exists:", !!supabaseUrl);
    console.log("SUPABASE_SERVICE_ROLE_KEY exists:", !!supabaseKey);
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("=== Fetching invoices from database ===");
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .in('id', invoiceIds);

    if (error) {
      console.error("Database error:", error);
      throw new Error(`Database error: ${error.message}`);
    }

    if (!invoices || invoices.length === 0) {
      throw new Error("No invoices found for provided IDs");
    }

    console.log(`Found ${invoices.length} invoices to process`);

    console.log("=== Processing invoices ===");
    const results = [];
    
    for (const invoice of invoices) {
      try {
        console.log(`Processing invoice: ${invoice.file_name} (${invoice.id})`);
        console.log(`File URL: ${invoice.file_url}`);
        
        if (!invoice.file_url) {
          throw new Error("Invoice has no file URL");
        }
        
        // Fetch the PDF file from Supabase Storage
        console.log("Fetching file from storage...");
        const fileResponse = await fetch(invoice.file_url, {
          method: 'GET',
          headers: {
            'User-Agent': 'FakturBot/1.0'
          }
        });
        
        console.log(`File fetch response: ${fileResponse.status} ${fileResponse.statusText}`);
        
        if (!fileResponse.ok) {
          throw new Error(`Failed to fetch file: ${fileResponse.status} ${fileResponse.statusText}`);
        }
        
        const fileBlob = await fileResponse.blob();
        console.log(`File fetched successfully: ${fileBlob.size} bytes, type: ${fileBlob.type}`);
        
        // Prepare FormData for n8n webhook
        console.log("Preparing FormData for n8n...");
        const formData = new FormData();
        formData.append('data', fileBlob, invoice.file_name);
        formData.append('userId', invoice.user_id);
        formData.append('invoiceId', invoice.id);
        formData.append('fileName', invoice.file_name);
        formData.append('source', 'email');
        formData.append('timestamp', new Date().toISOString());
        
        console.log(`Sending to n8n webhook: ${webhookUrl}`);
        console.log(`FormData entries: ${Array.from(formData.keys()).join(', ')}`);
        
        // Send to n8n webhook
        const webhookResponse = await fetch(webhookUrl, {
          method: "POST",
          body: formData,
          headers: {
            'User-Agent': 'FakturBot/1.0'
          }
        });
        
        console.log(`Webhook response: ${webhookResponse.status} ${webhookResponse.statusText}`);
        console.log(`Webhook response headers:`, Object.fromEntries(webhookResponse.headers.entries()));
        
        const responseText = await webhookResponse.text();
        console.log(`Webhook response body:`, responseText);
        
        if (!webhookResponse.ok) {
          console.error(`Webhook failed for ${invoice.file_name}:`, responseText);
          throw new Error(`Webhook request failed: ${webhookResponse.status} ${webhookResponse.statusText}. Response: ${responseText}`);
        }
        
        console.log(`Webhook success for ${invoice.file_name}`);
        
        results.push({
          invoiceId: invoice.id,
          fileName: invoice.file_name,
          success: true,
          webhookStatus: webhookResponse.status,
          result: responseText
        });
        
      } catch (error: any) {
        console.error(`Error processing invoice ${invoice.file_name}:`, error);
        console.error(`Error stack:`, error.stack);
        results.push({
          invoiceId: invoice.id,
          fileName: invoice.file_name,
          success: false,
          error: error.message
        });
      }
    }

    console.log("=== Processing complete ===");
    console.log(`Processed ${results.length} invoices`);
    const successCount = results.filter(r => r.success).length;
    const errorCount = results.filter(r => !r.success).length;
    console.log(`Success: ${successCount}, Errors: ${errorCount}`);

    const response = {
      success: true,
      processed_invoices: results.length,
      successful_invoices: successCount,
      failed_invoices: errorCount,
      results: results
    };

    console.log("=== Returning response ===");
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("=== FUNCTION ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Error type:", typeof error);
    console.error("Error constructor:", error.constructor.name);
    
    const errorResponse = {
      error: error.message,
      success: false,
      timestamp: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);