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
    
    // 1. Extract and verify JWT from Authorization header
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), { 
        status: 401, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }
    const jwt = auth.slice(7);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !user) {
      console.error('Authentication failed:', authErr);
      return new Response(JSON.stringify({ error: 'Authentication required' }), { 
        status: 401, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }

    console.log("Authenticated user:", user.id);

    const { invoiceIds }: SendToN8nRequest = await req.json();
    console.log("Received invoiceIds:", invoiceIds);
    
    if (!invoiceIds || invoiceIds.length === 0) {
      throw new Error("No invoice IDs provided");
    }

    // 2. Get webhook URLs - prioritize PROD
    const testUrl = Deno.env.get("N8N_WEBHOOK_URL_TEST")?.trim();
    const prodUrl = Deno.env.get("N8N_WEBHOOK_URL_PROD")?.trim();
    let webhookUrl = prodUrl || testUrl;
    
    if (!webhookUrl) {
      return new Response(JSON.stringify({ error: 'No N8N webhook URL configured' }), { 
        status: 500, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }

    console.log("Using webhook URL:", prodUrl ? "PROD" : "TEST");

    // 3. Set invoices to queued status
    await admin.from('invoices')
      .update({ status: 'queued' })
      .in('id', invoiceIds)
      .eq('user_id', user.id);

    // SECURITY: Fetch ONLY invoices belonging to the authenticated user
    const { data: invoices, error } = await admin
      .from('invoices')
      .select('*')
      .in('id', invoiceIds)
      .eq('user_id', user.id); // CRITICAL: Filter by user_id

    if (error) {
      console.error('Error fetching invoices:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    // SECURITY: Validate that all requested invoices belong to the user
    if (invoices.length !== invoiceIds.length) {
      console.error(`Security violation: User ${user.id} tried to access unauthorized invoices`);
      throw new Error('Access denied: Some invoices not found or not authorized');
    }

    if (!invoices || invoices.length === 0) {
      throw new Error("No invoices found");
    }

    // 4. Helper function to extract storage path from URL
    function storagePathFromPublicUrl(url?: string) {
      if (!url) return null;
      const match = url.match(/\/storage\/v1\/object\/public\/invoices\/(.+)$/) || url.match(/\/invoices\/(.+)$/);
      return match ? match[1] : null;
    }

    // Download PDF files from Storage and prepare FormData with files
    const formData = new FormData();
    
    // Download and attach PDF files with N8N field name "data"
    for (const invoice of invoices) {
      if (invoice.file_url) {
        try {
          console.log(`Downloading PDF for invoice ${invoice.id}: ${invoice.file_url}`);
          
          const path = storagePathFromPublicUrl(invoice.file_url);
          if (!path) { 
            console.error('Bad file_url for invoice', invoice.id, invoice.file_url); 
            continue; 
          }

          const { data: fileData, error: dlErr } = await admin.storage
            .from('invoices')
            .download(path);
          
          if (dlErr) {
            console.error('Download failed for invoice', invoice.id, dlErr);
            continue;
          }
          
          if (fileData) {
            const file = new File([fileData], invoice.file_name || 'invoice.pdf', { type: 'application/pdf' });
            formData.append('data', file);
            console.log(`Added file ${invoice.file_name} to FormData with field name "data"`);
          }
        } catch (downloadError) {
          console.error(`Error downloading file for invoice ${invoice.id}:`, downloadError);
          // Continue with other files even if one fails
        }
      }
    }
    
    // Add minimal metadata (bez file_url żeby nie mylić n8n workflow)
    const n8nPayload = {
      timestamp: new Date().toISOString(),
      action: 'approve_invoices',
      invoices: invoices.map(invoice => ({
        id: invoice.id,
        file_name: invoice.file_name,
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
    
    formData.append('json', JSON.stringify(n8nPayload));

    console.log("Sending to n8n webhook:", webhookUrl);
    console.log("Payload:", JSON.stringify(n8nPayload, null, 2));

    // 5. Send to n8n with fallback logic
    const post = (url: string) => fetch(url, { 
      method: 'POST', 
      headers: { 'User-Agent': 'FakturBot/1.0' }, 
      body: formData 
    });

    let resp = await post(webhookUrl);
    if (!resp.ok && resp.status === 404 && testUrl && prodUrl && webhookUrl.includes('/webhook-test/')) {
      console.warn('Test URL returned 404, retrying with PROD URL');
      resp = await post(prodUrl);
    }

    const body = await resp.text();
    console.log("Webhook response status:", resp.status);
    console.log("Webhook response body:", body);

    if (!resp.ok) {
      // Set invoices to failed status
      await admin.from('invoices')
        .update({ 
          status: 'failed', 
          last_processing_error: 'n8n dispatch error' 
        })
        .in('id', invoiceIds)
        .eq('user_id', user.id);

      return new Response(JSON.stringify({ 
        success: false, 
        error: `Webhook failed ${resp.status}`, 
        details: body 
      }), { 
        status: 502, 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }

    // 6. Set invoices to success status
    await admin.from('invoices')
      .update({ status: 'success' })
      .in('id', invoiceIds)
      .eq('user_id', user.id);

    return new Response(JSON.stringify({ 
      success: true,
      sent_invoices: invoices.length,
      webhook_status: resp.status,
      webhook_response: body
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