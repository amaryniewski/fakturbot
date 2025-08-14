import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== SIMPLE TEST FUNCTION ===");
    
    // Test basic functionality first
    const body = await req.text();
    console.log("Request body received:", body);
    
    // Test environment variable access
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    console.log("N8N_WEBHOOK_URL check:", {
      exists: !!webhookUrl,
      type: typeof webhookUrl,
      length: webhookUrl?.length || 0
    });
    
    if (!webhookUrl) {
      console.error("N8N_WEBHOOK_URL not found");
      return new Response(JSON.stringify({ 
        error: "N8N webhook URL not configured",
        debug: "Function can run but webhook URL missing"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    console.log("SUCCESS: Webhook URL found, length:", webhookUrl.length);
    
    return new Response(JSON.stringify({ 
      success: true,
      message: "Function working, webhook URL found",
      webhook_url_length: webhookUrl.length
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Function error:", error);
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