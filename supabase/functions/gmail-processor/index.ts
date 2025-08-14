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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // We'll check OCR settings per user, not globally
    console.log('Gmail processor started with fromDate:', fromDate, 'toDate:', toDate);
    
    // Get all active Gmail connections - use service role to bypass RLS
    const { data: connections, error: connectionsError } = await supabase
      .rpc('get_all_active_gmail_connections');

    if (connectionsError) {
      console.error('Failed to fetch connections:', connectionsError);
      throw new Error(`Failed to fetch connections: ${connectionsError.message}`);
    }

    console.log(`Processing ${connections?.length || 0} Gmail connections:`, connections?.map(c => c.email));
    
    let totalProcessedGlobal = 0;
    let skippedDuplicatesGlobal = 0;
    
    for (const connection of connections || []) {
      console.log(`Processing connection: ${connection.email}`);
      
      // Reset counters for each user
      let totalProcessed = 0;
      let skippedDuplicates = 0;
      let processedMessagesThisUser = 0;
      
      try {
        // Get decrypted tokens for this connection using the new function that includes user_id
        const { data: tokenData, error: tokenError } = await supabase
          .rpc('get_decrypted_gmail_tokens_with_user', { p_connection_id: connection.id });

        if (tokenError || !tokenData?.[0]) {
          console.error(`Failed to get tokens for ${connection.email}:`, tokenError);
          continue;
        }

        const { access_token, refresh_token, email, user_id, token_expires_at } = tokenData[0];
        
        // Check if token is expired and refresh if needed
        let currentAccessToken = access_token;
        if (token_expires_at && new Date(token_expires_at) <= new Date()) {
          console.log(`Token expired for ${email}, refreshing...`);
          
          try {
            const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
                client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
                refresh_token: refresh_token,
                grant_type: 'refresh_token'
              })
            });

            if (!refreshResponse.ok) {
              console.error(`Failed to refresh token for ${email}:`, await refreshResponse.text());
              continue;
            }

            const refreshData = await refreshResponse.json();
            currentAccessToken = refreshData.access_token;
            
            // Update tokens in database
            const newExpiresAt = new Date(Date.now() + (refreshData.expires_in * 1000));
            await supabase.rpc('update_encrypted_gmail_tokens', {
              p_connection_id: connection.id,
              p_access_token: currentAccessToken,
              p_refresh_token: refreshData.refresh_token || refresh_token,
              p_token_expires_at: newExpiresAt.toISOString()
            });
            
            console.log(`Token refreshed successfully for ${email}`);
          } catch (refreshError) {
            console.error(`Error refreshing token for ${email}:`, refreshError);
            continue;
          }
        }
        
        
        // Get user's automation settings - check OCR setting per user
        const { data: userAutomationSettings } = await supabase
          .from('user_automation_settings')
          .select('auto_send_to_ocr')
          .eq('user_id', user_id)
          .single();
          
        const shouldAutoOCR = userAutomationSettings?.auto_send_to_ocr || false;
        console.log(`User ${user_id} auto OCR setting:`, shouldAutoOCR);
        
        // Get user's filter settings
        const { data: filterSettings } = await supabase
          .from('gmail_filter_settings')
          .select('filter_query, allowed_sender_emails')
          .eq('user_id', user_id)
          .single();
        
        // Use fromDate if provided, otherwise default to last 7 days
        const searchFromDate = fromDate ? new Date(fromDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const searchToDate = toDate ? new Date(toDate) : new Date();
        
        // Use custom filter query if available, otherwise default
        const baseQuery = filterSettings?.filter_query || 'has:attachment is:unread subject:invoice OR subject:faktura OR subject:fakturę OR subject:faktury';
        const dateQuery = `after:${searchFromDate.toISOString().split('T')[0]} before:${searchToDate.toISOString().split('T')[0]}`;
        const query = `${baseQuery} ${dateQuery}`;
        
        const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`;
        
        const searchResponse = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${currentAccessToken}` }
        });

        if (!searchResponse.ok) {
          console.error(`Gmail API search failed for ${email}:`, await searchResponse.text());
          continue;
        }

        const searchResult = await searchResponse.json();
        const messages = searchResult.messages || [];
        
        console.log(`Found ${messages.length} potential invoice emails for ${email}`);

        for (const message of messages.slice(0, 10)) { // Process max 10 per run
          let messageHasValidAttachments = false; // Track if this message has valid PDF attachments
          try {
            // SECURITY CHECK: Verify this connection belongs to the current user_id
            const { data: connectionVerification } = await supabase
              .from('gmail_connections')
              .select('user_id')
              .eq('id', connection.id)
              .eq('is_active', true)
              .single();

            if (!connectionVerification || connectionVerification.user_id !== user_id) {
              console.error(`SECURITY BREACH DETECTED: Connection ${connection.id} user mismatch`);
              continue;
            }

            // Check if we already processed this message FOR THIS SPECIFIC USER
            const { data: existingInvoice } = await supabase
              .from('invoices')
              .select('id')
              .eq('gmail_message_id', message.id)
              .eq('user_id', user_id)
              .single();

            if (existingInvoice) {
              console.log(`Message ${message.id} already processed, skipping`);
              skippedDuplicates++;
              skippedDuplicatesGlobal++;
              continue;
            }

            // Get full message details
            const messageUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`;
            const messageResponse = await fetch(messageUrl, {
              headers: { Authorization: `Bearer ${currentAccessToken}` }
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
                  headers: { Authorization: `Bearer ${currentAccessToken}` }
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

                // Create invoice record - CRITICAL: Ensure user_id is set correctly
                const { data: invoiceRecord, error: invoiceError } = await supabase
                  .from('invoices')
                  .insert({
                    user_id: user_id, // SECURITY: Always use the verified user_id from token data
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
                  .select('id')
                  .single();

                if (invoiceError) {
                  console.error('Failed to create invoice:', invoiceError);
                  // Check if it's a duplicate error (new constraint)
                  if (invoiceError.code === '23505' && invoiceError.message.includes('unique_user_message_attachment')) {
                    console.log(`Duplicate invoice detected for message ${message.id}, skipping`);
                    skippedDuplicates++;
                    skippedDuplicatesGlobal++;
                    continue;
                  }
                  // SECURITY LOG
                  await supabase.rpc('log_token_access', {
                    p_action: 'invoice_creation_failed',
                    p_table_name: 'invoices', 
                    p_record_id: null
                  });
                  continue;
                }

                totalProcessed++;
                totalProcessedGlobal++;
                messageHasValidAttachments = true; // Mark this message as having valid attachments
                console.log(`Processed invoice: ${part.filename} from ${senderEmail} (user: ${user_id})`);
                
                // Auto-trigger OCR if enabled for THIS USER - use n8n OCR processor
                if (shouldAutoOCR) {
                  try {
                    console.log(`Starting n8n OCR for user ${user_id}, invoice: ${part.filename}`);
                    // Use n8n OCR processor instead of old edge functions
                    await supabase.functions.invoke('n8n-ocr-processor', {
                      body: { 
                        invoiceId: invoiceRecord?.id,
                        invoiceUrl: publicUrl,
                        userId: user_id
                      }
                    });
                    console.log(`n8n OCR processing started for ${part.filename}`);
                  } catch (ocrError) {
                    console.error(`OCR processing failed for ${part.filename}:`, ocrError);
                  }
                } else {
                  console.log(`OCR not started for ${part.filename} - user ${user_id} has auto OCR disabled`);
                }
              }
            }
          } catch (messageError) {
            console.error(`Error processing message ${message.id}:`, messageError);
            continue;
          } finally {
            // Count processed messages (unique emails with valid attachments) for this user
            if (messageHasValidAttachments) {
              processedMessagesThisUser++;
            }
          }
        }
        
        console.log(`User ${user_id} (${email}): processed ${processedMessagesThisUser} unique messages with ${totalProcessed} total attachments`);
      } catch (connectionError) {
        console.error(`Error processing connection ${connection.email}:`, connectionError);
        continue;
      }
    }

    console.log(`Gmail processing completed: ${totalProcessedGlobal} new invoices, ${skippedDuplicatesGlobal} duplicates skipped`);
    console.log(`FINAL RESULT - processedInvoices: ${totalProcessedGlobal}, skippedDuplicates: ${skippedDuplicatesGlobal}, processedConnections: ${connections?.length || 0}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        processedConnections: connections?.length || 0,
        processedInvoices: totalProcessedGlobal,
        skippedDuplicates: skippedDuplicatesGlobal
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