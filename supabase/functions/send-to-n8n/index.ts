import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  console.log("=== SEND-TO-N8N FUNCTION STARTING ===");
  
  if (req.method === "OPTIONS") {
    console.log("Handling CORS preflight request");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== PARSING REQUEST BODY ===");
    const requestBody = await req.text();
    console.log("Raw request body:", requestBody);
    
    let parsedBody;
    try {
      parsedBody = JSON.parse(requestBody);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return new Response(JSON.stringify({ 
        error: "Invalid JSON in request body",
        success: false 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    const { invoiceIds } = parsedBody;
    console.log("Received invoiceIds:", invoiceIds);
    
    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      console.error("Invalid invoiceIds:", invoiceIds);
      return new Response(JSON.stringify({ 
        error: "No valid invoice IDs provided",
        success: false 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("=== CHECKING ENVIRONMENT VARIABLES ===");
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    console.log("N8N_WEBHOOK_URL found:", !!webhookUrl);
    console.log("SUPABASE_URL found:", !!supabaseUrl);
    console.log("SUPABASE_SERVICE_ROLE_KEY found:", !!supabaseKey);
    
    if (!webhookUrl) {
      console.error("N8N_WEBHOOK_URL not found");
      return new Response(JSON.stringify({ 
        error: "N8N webhook URL not configured",
        success: false 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("=== CREATING SUPABASE CLIENT ===");
    const supabase = createClient(supabaseUrl || "", supabaseKey || "");

    console.log("=== FETCHING INVOICES ===");
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .in('id', invoiceIds);

    if (error) {
      console.error("Database error:", error);
      return new Response(JSON.stringify({ 
        error: `Database error: ${error.message}`,
        success: false 
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!invoices || invoices.length === 0) {
      console.error("No invoices found for IDs:", invoiceIds);
      return new Response(JSON.stringify({ 
        error: "No invoices found",
        success: false 
      }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Found ${invoices.length} invoices to process`);

    const results = [];
    let successCount = 0;
    let failureCount = 0;

    // Process all invoices
    for (const invoice of invoices) {
      console.log(`=== PROCESSING INVOICE ${invoice.id} ===`);
      console.log(`Processing invoice: ${invoice.file_name}`);
      
      try {
        if (!invoice.file_url) {
          console.error(`No file URL for invoice: ${invoice.id}`);
          results.push({
            invoice_id: invoice.id,
            file_name: invoice.file_name,
            success: false,
            error: "No file URL"
          });
          failureCount++;
          continue;
        }

        console.log(`Downloading file from: ${invoice.file_url}`);
        const fileResponse = await fetch(invoice.file_url);
        
        if (!fileResponse.ok) {
          console.error(`File download failed: ${fileResponse.status} ${fileResponse.statusText}`);
          results.push({
            invoice_id: invoice.id,
            file_name: invoice.file_name,
            success: false,
            error: `Failed to download file: ${fileResponse.status}`
          });
          failureCount++;
          continue;
        }

        const fileBuffer = await fileResponse.arrayBuffer();
        console.log(`Downloaded file size: ${fileBuffer.byteLength} bytes`);

        console.log("=== SENDING TO N8N WEBHOOK ===");
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: 'application/pdf' });
        formData.append('data', blob, invoice.file_name);
        
        console.log(`Sending to: ${webhookUrl}`);
        const webhookResponse = await fetch(webhookUrl, {
          method: "POST",
          body: formData
        });

        console.log(`Webhook response: ${webhookResponse.status} ${webhookResponse.statusText}`);
        const responseText = await webhookResponse.text();
        console.log("Webhook response body:", responseText);

        if (webhookResponse.ok) {
          results.push({
            invoice_id: invoice.id,
            file_name: invoice.file_name,
            success: true,
            webhook_status: webhookResponse.status,
            webhook_response: responseText
          });
          successCount++;
          console.log(`✅ Successfully sent ${invoice.file_name} to N8N`);
        } else {
          results.push({
            invoice_id: invoice.id,
            file_name: invoice.file_name,
            success: false,
            error: `Webhook failed: ${webhookResponse.status}`,
            webhook_response: responseText
          });
          failureCount++;
          console.log(`❌ Failed to send ${invoice.file_name} to N8N: ${webhookResponse.status}`);
        }

      } catch (error: any) {
        console.error(`Error processing invoice ${invoice.id}:`, error);
        results.push({
          invoice_id: invoice.id,
          file_name: invoice.file_name,
          success: false,
          error: error.message || "Unknown error"
        });
        failureCount++;
      }
    }

    console.log(`=== PROCESSING COMPLETE ===`);
    console.log(`Total invoices: ${invoices.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);

    return new Response(JSON.stringify({ 
      success: successCount > 0,
      message: `Processed ${invoices.length} invoices: ${successCount} successful, ${failureCount} failed`,
      total_invoices: invoices.length,
      successful_count: successCount,
      failed_count: failureCount,
      results: results
    }), {
      status: successCount > 0 ? 200 : 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("=== FUNCTION ERROR ===", error);
    console.error("Error stack:", error.stack);
    return new Response(JSON.stringify({ 
      error: error.message || "Unknown error occurred",
      success: false 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);