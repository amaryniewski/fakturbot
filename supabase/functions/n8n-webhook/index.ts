import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceWebhookPayload {
  user_id: string;
  gmail_message_id: string;
  sender_email: string;
  subject: string;
  received_at: string;
  attachments: Array<{
    filename: string;
    size: number;
    content_base64?: string;
    download_url?: string;
  }>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const payload: InvoiceWebhookPayload = await req.json();
    console.log("Received webhook payload:", payload);

    const { 
      user_id, 
      gmail_message_id, 
      sender_email, 
      subject, 
      received_at, 
      attachments 
    } = payload;

    // Validate required fields
    if (!user_id || !sender_email || !received_at || !attachments?.length) {
      throw new Error("Missing required fields");
    }

    // Process each attachment as a potential invoice
    const invoicePromises = attachments.map(async (attachment) => {
      // Check if attachment is likely an invoice (PDF)
      if (!attachment.filename.toLowerCase().endsWith('.pdf')) {
        console.log(`Skipping non-PDF attachment: ${attachment.filename}`);
        return null;
      }

      let fileUrl = attachment.download_url;

      // If we have base64 content, upload to Supabase Storage
      if (attachment.content_base64 && !fileUrl) {
        try {
          const fileBuffer = Uint8Array.from(atob(attachment.content_base64), c => c.charCodeAt(0));
          const fileName = `${user_id}/${Date.now()}-${attachment.filename}`;
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(fileName, fileBuffer, {
              contentType: 'application/pdf',
              upsert: true
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            throw uploadError;
          }

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('invoices')
            .getPublicUrl(fileName);
            
          fileUrl = publicUrl;
        } catch (uploadError) {
          console.error('Failed to upload file:', uploadError);
          // Continue without file URL - invoice will be marked for retry
        }
      }

      // Insert invoice record
      const { data: invoice, error: insertError } = await supabase
        .from('invoices')
        .insert({
          user_id,
          gmail_message_id,
          sender_email,
          subject,
          received_at,
          file_name: attachment.filename,
          file_size: attachment.size,
          file_url: fileUrl,
          status: fileUrl ? 'new' : 'failed',
          error_message: fileUrl ? null : 'Failed to upload file'
        })
        .select()
        .single();

      if (insertError) {
        console.error('Insert error:', insertError);
        throw insertError;
      }

      console.log(`Created invoice record: ${invoice.id}`);
      return invoice;
    });

    const results = await Promise.all(invoicePromises);
    const successfulInvoices = results.filter(r => r !== null);

    console.log(`Processed ${successfulInvoices.length} invoices from ${attachments.length} attachments`);

    return new Response(JSON.stringify({ 
      success: true,
      processed: successfulInvoices.length,
      total_attachments: attachments.length,
      invoices: successfulInvoices.map(inv => ({
        id: inv.id,
        file_name: inv.file_name,
        status: inv.status
      }))
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error in n8n-webhook function:", error);
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