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

    // Download PDF files from Storage and prepare FormData with files
    const formData = new FormData();
    
    // Add metadata as JSON
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
    
    formData.append('json', JSON.stringify(n8nPayload));
    
    // Download and attach PDF files with detailed logging and error handling
    let successfulFiles = 0;
    let totalFiles = invoices.filter(i => i.file_url).length;
    
    console.log(`Starting to process ${totalFiles} PDF files`);
    
    for (const invoice of invoices) {
      if (invoice.file_url) {
        try {
          console.log(`[${invoice.id}] Starting PDF fetch from: ${invoice.file_url}`);
          console.log(`[${invoice.id}] Expected filename: ${invoice.file_name}`);
          
          // Add timeout for fetch operation (30 seconds)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);
          
          // Fetch file with timeout
          const fileResponse = await fetch(invoice.file_url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'FakturBot/1.0'
            }
          });
          
          clearTimeout(timeoutId);
          
          console.log(`[${invoice.id}] Fetch response status: ${fileResponse.status}`);
          console.log(`[${invoice.id}] Response headers:`, Object.fromEntries(fileResponse.headers.entries()));
          
          if (!fileResponse.ok) {
            console.error(`[${invoice.id}] Failed to fetch file: ${fileResponse.status} ${fileResponse.statusText}`);
            continue;
          }
          
          // Get file as blob
          const fileBlob = await fileResponse.blob();
          console.log(`[${invoice.id}] Downloaded blob - Size: ${fileBlob.size} bytes, Type: ${fileBlob.type}`);
          
          // Validate file size (must be > 0 and < 50MB)
          if (fileBlob.size === 0) {
            console.error(`[${invoice.id}] File is empty (0 bytes)`);
            continue;
          }
          
          if (fileBlob.size > 50 * 1024 * 1024) {
            console.error(`[${invoice.id}] File too large: ${fileBlob.size} bytes`);
            continue;
          }
          
          // Create a proper blob with PDF content type if not set
          const finalBlob = fileBlob.type ? fileBlob : new Blob([fileBlob], { type: 'application/pdf' });
          
          // Add file to FormData
          formData.append(`file_${invoice.id}`, finalBlob, invoice.file_name);
          successfulFiles++;
          console.log(`[${invoice.id}] ✅ Successfully added to FormData - Final type: ${finalBlob.type}`);
          
        } catch (downloadError) {
          console.error(`[${invoice.id}] ❌ Error during file processing:`, downloadError);
          if (downloadError.name === 'AbortError') {
            console.error(`[${invoice.id}] File download timed out after 30 seconds`);
          }
          // Continue with other files even if one fails
        }
      } else {
        console.log(`[${invoice.id}] No file_url provided, skipping file attachment`);
      }
    }
    
    console.log(`File processing complete: ${successfulFiles}/${totalFiles} files successfully processed`);
    
    // Log FormData contents for debugging
    console.log("FormData contents summary:");
    for (const [key, value] of formData.entries()) {
      if (key === 'json') {
        console.log(`- ${key}: JSON metadata (${JSON.stringify(value).length} chars)`);
      } else {
        console.log(`- ${key}: File ${value instanceof File ? value.name : 'blob'} (${value instanceof Blob ? value.size : 'unknown'} bytes)`);
      }
    }

    console.log("Sending to n8n webhook:", webhookUrl);
    console.log("Payload:", JSON.stringify(n8nPayload, null, 2));

    // Send to n8n webhook with FormData (multipart/form-data)
    console.log("About to send POST request to:", webhookUrl);
    
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "User-Agent": "FakturBot/1.0",
        // Don't set Content-Type for FormData - browser will set it with boundary
      },
      body: formData,
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