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
    const { fromDate, toDate } = await req.json().catch(() => ({}));
    console.log('Gmail processor started with fromDate:', fromDate, 'toDate:', toDate);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get all active Gmail connections - use service role with proper validation
    const { data: connections, error: connectionsError } = await supabase
      .rpc('get_all_active_gmail_connections_for_processing');

    if (connectionsError) {
      console.error('Failed to fetch connections:', connectionsError);
      throw new Error(`Failed to fetch connections: ${connectionsError.message}`);
    }

    console.log(`Processing ${connections?.length || 0} Gmail connections:`, connections?.map(c => `${c.email} (user: ${c.user_id})`));
    
    let totalProcessed = 0;
    
    for (const connection of connections || []) {
      const { id: connectionId, email: userEmail, user_id } = connection;
      console.log(`🔄 Processing connection: ${userEmail} for user: ${user_id}`);
      
      // Critical security validation
      if (!user_id) {
        console.error(`❌ CRITICAL: No user_id found for connection ${connectionId}, skipping`);
        continue;
      }
      
      try {
        // Double validate connection ownership using our security function
        const { data: isValidOwner } = await supabase
          .rpc('validate_connection_ownership', { 
            p_connection_id: connectionId, 
            p_user_id: user_id 
          });
        
        if (!isValidOwner) {
          console.error(`❌ CRITICAL: Connection ${connectionId} ownership validation failed for user ${user_id}, skipping`);
          continue;
        }
        
        // Get decrypted tokens for this connection using the new function that includes user_id
        const { data: tokenData, error: tokenError } = await supabase
          .rpc('get_decrypted_gmail_tokens_with_user', { p_connection_id: connectionId });

        if (tokenError || !tokenData?.[0]) {
          console.error(`Failed to get tokens for ${userEmail}:`, tokenError);
          continue;
        }

        const { access_token, email } = tokenData[0];
        
        // Get user's filter settings - use service role with proper user validation
        const { data: filterSettings } = await supabase
          .from('gmail_filter_settings')
          .select('filter_query, allowed_sender_emails')
          .eq('user_id', user_id)
          .single();
        
        console.log(`Processing Gmail connection for user ${user_id}, email: ${email}`);
        
        // Use fromDate if provided, otherwise default to last 7 days
        const searchFromDate = fromDate ? new Date(fromDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const searchToDate = toDate ? new Date(toDate) : new Date();
        
        // Use custom filter query if available, otherwise default
        const baseQuery = filterSettings?.filter_query || 'has:attachment is:unread subject:invoice OR subject:faktura OR subject:fakturę OR subject:faktury';
        const dateQuery = `after:${searchFromDate.toISOString().split('T')[0]} before:${searchToDate.toISOString().split('T')[0]}`;
        const query = `${baseQuery} ${dateQuery}`;
        
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
            // Check if we already processed this message for THIS user
            const { data: existingInvoice } = await supabase
              .from('invoices')
              .select('id, user_id')
              .eq('gmail_message_id', message.id)
              .eq('user_id', user_id)
              .single();
            
            console.log(`Checking for existing invoice for message ${message.id} and user ${user_id}:`, existingInvoice);

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
            
            // Check if sender is allowed (if restriction is set)
            if (filterSettings?.allowed_sender_emails && filterSettings.allowed_sender_emails.length > 0) {
              const isAllowed = filterSettings.allowed_sender_emails.some(allowedEmail => 
                senderEmail.toLowerCase().includes(allowedEmail.toLowerCase())
              );
              if (!isAllowed) {
                console.log(`Skipping email from ${senderEmail} - not in allowed senders list`);
                continue;
              }
            }

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
                const fileName = `${user_id}/${Date.now()}-${part.filename}`;
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

                // Create invoice record with explicit user_id validation
                console.log(`Creating invoice for user ${user_id}, email: ${email}, message: ${message.id}`);
                const { data: invoiceData, error: invoiceError } = await supabase
                  .from('invoices')
                  .insert({
                    user_id: user_id, // CRITICAL: This must match the Gmail connection owner
                    gmail_message_id: message.id,
                    sender_email: senderEmail,
                    subject: subject,
                    received_at: receivedDate.toISOString(),
                    file_name: part.filename,
                    file_size: fileBuffer.length,
                    file_url: publicUrl,
                    status: 'new',
                    needs_review: true
                  })
                  .select()
                  .single();

                if (invoiceError) {
                  console.error('Failed to create invoice:', invoiceError);
                  continue;
                }

                if (invoiceData) {
                  totalProcessed++;
                  
                  // Critical validation: ensure invoice was created for correct user
                  if (invoiceData.user_id !== user_id) {
                    console.error(`❌ CRITICAL SECURITY ERROR: Invoice created for wrong user! Expected: ${user_id}, Got: ${invoiceData.user_id} - This should never happen with proper RLS!`);
                    // Log security incident
                    await supabase.rpc('log_data_access_attempt', {
                      p_user_id: user_id,
                      p_action: 'SECURITY_VIOLATION_WRONG_USER_ID',
                      p_resource_id: invoiceData.id,
                      p_resource_type: 'invoice'
                    });
                    continue;
                  }
                  
                  console.log(`✅ CREATED INVOICE for USER ${user_id}: ${part.filename} from ${senderEmail}, ID: ${invoiceData.id}, Verified User: ${invoiceData.user_id}`);
                  
                  // Trigger OCR processing with proper parameters
                  try {
                    await supabase.functions.invoke('ocr-processor', {
                      body: { 
                        invoiceId: invoiceData.id, 
                        userId: user_id 
                      }
                    });
                  } catch (ocrError) {
                    console.error('Failed to trigger OCR:', ocrError);
                  }
                }
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