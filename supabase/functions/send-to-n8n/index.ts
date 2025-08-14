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

    // Get webhook URL - try environment variable first, then use fallback
    let webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    
    if (!webhookUrl) {
      console.log("N8N_WEBHOOK_URL not found in environment, using fallback");
      // TODO: Replace this with your actual N8N webhook URL
      webhookUrl = "https://your-n8n-instance.com/webhook/invoice-approval";
    }
    
    console.log("Using webhook URL:", webhookUrl);

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

    // Create simple JSON payload
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
        approved_at: invoice.approved_at
      }))
    };
    
    console.log("Sending to webhook:", webhookUrl);
    console.log("Payload:", JSON.stringify(n8nPayload, null, 2));

    // Send to webhook
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "FakturBot/1.0",
      },
      body: JSON.stringify(n8nPayload),
    });

    console.log("Webhook response status:", webhookResponse.status);
    
    const responseText = await webhookResponse.text();
    console.log("Webhook response:", responseText);

    return new Response(JSON.stringify({ 
      success: true,
      sent_invoices: invoices.length,
      webhook_status: webhookResponse.status,
      webhook_response: responseText
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