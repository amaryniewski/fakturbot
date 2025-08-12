import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface GmailMessage {
  id: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: Array<{
      filename: string;
      mimeType: string;
      body: { attachmentId?: string; data?: string };
    }>;
  };
  internalDate: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fromDate } = await req.json().catch(() => ({}));
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get all active Gmail connections using the secure function
    const { data: connections, error: connectionsError } = await supabase
      .rpc('get_safe_gmail_connections');

    if (connectionsError) {
      throw new Error(`Failed to fetch connections: ${connectionsError.message}`);
    }

    console.log(`Processing ${connections?.length || 0} Gmail connections`);
    
    let totalProcessed = 0;
    
    for (const connection of connections || []) {
      console.log(`Processing connection: ${connection.email}`);
      
      try {
        // Get decrypted tokens for this connection using the correct function name
        const { data: tokenData, error: tokenError } = await supabase
          .rpc('get_decrypted_gmail_tokens', { p_connection_id: connection.id });

        if (tokenError || !tokenData?.[0]) {
          console.error(`Failed to get tokens for ${connection.email}:`, tokenError);
          continue;
        }

        const { access_token, email } = tokenData[0];
        
        // Use fromDate if provided, otherwise default to last 7 days
        const searchFromDate = fromDate ? new Date(fromDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const query = `in:inbox has:attachment after:${searchFromDate.toISOString().split('T')[0]} filename:pdf`;
        
        const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`;
        
        const searchResponse = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${access_token}` }
        });

        if (!searchResponse.ok) {
          console.error(`Gmail API search failed for ${email}:`, await searchResponse.text());
          continue;
        }

        const searchResult = await searchResponse.json();
        const messages = searchResult.messages || [];
        
        console.log(`Found ${messages.length} potential invoice emails for ${email}`);

        for (const message of messages.slice(0, 10)) { // Process max 10 per run
          try {
            // Check if we already processed this message
            const { data: existingInvoice } = await supabase
              .from('invoices')
              .select('id')
              .eq('gmail_message_id', message.id)
              .eq('user_id', tokenData[0].user_id || connection.id) // Use user_id from token data
              .single();

            if (existingInvoice) {
              console.log(`Message ${message.id} already processed, skipping`);
              continue;
            }

            // Get full message details
            const messageUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`;
            const messageResponse = await fetch(messageUrl, {
              headers: { Authorization: `Bearer ${access_token}` }
            });

            if (!messageResponse.ok) continue;

            const messageData: GmailMessage = await messageResponse.json();
            
            // Extract email metadata
            const headers = messageData.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const senderEmail = from.match(/<(.+)>/)?.[1] || from;
            const receivedDate = new Date(parseInt(messageData.internalDate));

            // Find PDF attachments
            const parts = messageData.payload.parts || [];
            for (const part of parts) {
              if (part.filename && part.filename.toLowerCase().includes('.pdf') && part.body.attachmentId) {
                
                // Download attachment
                const attachmentUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}/attachments/${part.body.attachmentId}`;
                const attachmentResponse = await fetch(attachmentUrl, {
                  headers: { Authorization: `Bearer ${access_token}` }
                });

                if (!attachmentResponse.ok) continue;

                const attachmentData = await attachmentResponse.json();
                const fileBuffer = Uint8Array.from(atob(attachmentData.data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

                // Upload to Supabase Storage
                const fileName = `${connection.user_id}/${Date.now()}-${part.filename}`;
                const { data: uploadData, error: uploadError } = await supabase.storage
                  .from('invoices')
                  .upload(fileName, fileBuffer, {
                    contentType: 'application/pdf'
                  });

                if (uploadError) {
                  console.error('Upload error:', uploadError);
                  continue;
                }

                // Get public URL
                const { data: { publicUrl } } = supabase.storage
                  .from('invoices')
                  .getPublicUrl(fileName);

                // Create invoice record
                const { error: invoiceError } = await supabase
                  .from('invoices')
                  .insert({
                    user_id: tokenData[0].user_id || connection.id, // Use user_id from token data
                    gmail_message_id: message.id,
                    sender_email: senderEmail,
                    subject: subject,
                    received_at: receivedDate.toISOString(),
                    file_name: part.filename,
                    file_size: fileBuffer.length,
                    file_url: publicUrl,
                    status: 'new',
                    needs_review: true
                  });

                if (invoiceError) {
                  console.error('Failed to create invoice:', invoiceError);
                  continue;
                }

                totalProcessed++;
                console.log(`Processed invoice: ${part.filename} from ${senderEmail}`);
                
                // Trigger OCR processing
                await supabase.functions.invoke('ocr-processor', {
                  body: { fileName, userId: tokenData[0].user_id || connection.id }
                });
              }
            }
          } catch (messageError) {
            console.error(`Error processing message ${message.id}:`, messageError);
            continue;
          }
        }
      } catch (connectionError) {
        console.error(`Error processing connection ${connection.email}:`, connectionError);
        continue;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processedConnections: connections?.length || 0,
        processedInvoices: totalProcessed 
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in gmail-processor:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );
  }
};

serve(handler);