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
    console.log("Request method:", req.method);
    console.log("Request URL:", req.url);
    
    // DEBUG: Log all environment variables
    console.log("=== ENVIRONMENT VARIABLES DEBUG ===");
    const envKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "N8N_WEBHOOK_URL"];
    envKeys.forEach(key => {
      const value = Deno.env.get(key);
      console.log(`${key}:`, value ? `SET (${value.length} chars)` : "NOT SET");
    });
    
    const { invoiceIds }: SendToN8nRequest = await req.json();
    console.log("Received invoiceIds:", invoiceIds);
    
    if (!invoiceIds || invoiceIds.length === 0) {
      console.error("ERROR: No invoice IDs provided");
      throw new Error("No invoice IDs provided");
    }

    // Get webhook URL from Supabase secrets
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    console.log("N8N_WEBHOOK_URL lookup result:");
    console.log("- exists:", !!webhookUrl);
    console.log("- type:", typeof webhookUrl);
    console.log("- value preview:", webhookUrl ? `${webhookUrl.substring(0, 50)}...` : "NULL/UNDEFINED");
    
    if (!webhookUrl) {
      console.error("CRITICAL ERROR: N8N webhook URL not found in environment");
      console.error("Available env keys:", Object.keys(Deno.env.toObject()));
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

    // SIMPLIFIED VERSION: Send only JSON data without PDF files
    const n8nPayload = {
      timestamp: new Date().toISOString(),
      action: 'approve_invoices',
      invoices: invoices.map(invoice => ({
        id: invoice.id,
        file_name: invoice.file_name,
        file_url: invoice.file_url,
        sender_email: invoice.sender_email,
        subject: invoice.subject,
        received_at: invoice.received_at,
        approved_at: invoice.approved_at,
        // Only include extracted_data if it exists and is not null
        ...(invoice.extracted_data && Object.keys(invoice.extracted_data).length > 0 && {
          extracted_data: invoice.extracted_data
        })
      }))
    };
    
    console.log("SIMPLIFIED MODE: Sending only JSON data (no PDF files)");
    console.log("N8N Payload:", JSON.stringify(n8nPayload, null, 2));

    console.log("Sending to n8n webhook:", webhookUrl);
    console.log("Payload:", JSON.stringify(n8nPayload, null, 2));

    // Send to n8n webhook with JSON data only
    console.log("About to send POST request to:", webhookUrl);
    
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "User-Agent": "FakturBot/1.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(n8nPayload),
    });

    console.log("Webhook response status:", webhookResponse.status);
    console.log("Webhook response statusText:", webhookResponse.statusText);
    console.log("Webhook response headers:", Object.fromEntries(webhookResponse.headers.entries()));

    const webhookResult = await webhookResponse.text();
    console.log("Webhook response body:", webhookResult);

    if (!webhookResponse.ok) {
      console.error("Webhook failed with status:", webhookResponse.status);
      console.error("Response body:", webhookResult);
      throw new Error(`Webhook request failed: ${webhookResponse.status} ${webhookResponse.statusText}. Response: ${webhookResult}`);
    }

    return new Response(JSON.stringify({ 
      success: true,
      sent_invoices: invoices.length,
      webhook_status: webhookResponse.status,
      webhook_response: webhookResult
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