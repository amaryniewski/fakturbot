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
      const { id: connectionId, email: userEmail, user_id: connectionUserId } = connection;
      console.log(`🔄 Processing connection: ${userEmail} for user: ${connectionUserId}`);
      
      // Critical security validation
      if (!connectionUserId) {
        console.error(`❌ CRITICAL: No user_id found for connection ${connectionId}, skipping`);
        continue;
      }
      
      try {
        // CRITICAL: Enhanced connection ownership validation
        const { data: isValidOwner } = await supabase
          .rpc('validate_connection_ownership_enhanced', { 
            p_connection_id: connectionId, 
            p_user_id: connectionUserId 
          });
        
        if (!isValidOwner) {
          console.error(`❌ CRITICAL SECURITY: Connection ${connectionId} ownership validation failed for user ${connectionUserId}`);
          await supabase.rpc('audit_user_data_access', {
            p_user_id: connectionUserId,
            p_operation: 'connection_SECURITY_VIOLATION',
            p_table_name: 'gmail_connections',
            p_details: { connection_id: connectionId, attempted_by: 'gmail-processor' }
          });
          continue;
        }
        
        // Get decrypted tokens for this connection using the new function that includes user_id
        const { data: tokenData, error: tokenError } = await supabase
          .rpc('get_decrypted_gmail_tokens_with_user', { p_connection_id: connectionId });

        if (tokenError || !tokenData?.[0]) {
          console.error(`Failed to get tokens for ${userEmail}:`, tokenError);
          continue;
        }

        let { access_token, refresh_token, email: tokenEmail, token_expires_at, user_id: tokenUserId } = tokenData[0];
        
        // Check if token is expired and refresh if needed
        const tokenExpiry = new Date(token_expires_at);
        const isExpired = tokenExpiry <= new Date();
        
        if (isExpired && refresh_token) {
          console.log(`🔄 Token expired for ${userEmail}, refreshing...`);
          
          // Refresh the token
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
            console.error(`Failed to refresh token for ${userEmail}:`, await refreshResponse.text());
            continue;
          }
          
          const refreshData = await refreshResponse.json();
          const newAccessToken = refreshData.access_token;
          const expiresIn = refreshData.expires_in || 3600;
          const newExpiryTime = new Date(Date.now() + expiresIn * 1000);
          
          // Update the token in database
          await supabase.rpc('update_encrypted_gmail_tokens', {
            p_connection_id: connectionId,
            p_access_token: newAccessToken,
            p_token_expires_at: newExpiryTime.toISOString()
          });
          
          console.log(`✅ Token refreshed for ${userEmail}, expires at: ${newExpiryTime}`);
          
          // Use the new token
          access_token = newAccessToken;
        } else if (isExpired) {
          console.error(`Token expired for ${userEmail} and no refresh token available`);
          continue;
        }
        
        // Get user's filter settings - use service role with proper user validation
        const { data: filterSettings } = await supabase
          .from('gmail_filter_settings')
          .select('filter_query, allowed_sender_emails')
          .eq('user_id', connectionUserId)
          .single();
        
        console.log(`Processing Gmail connection for user ${connectionUserId}, email: ${userEmail}`);
        
        // Use fromDate if provided, otherwise default to last 7 days
        const searchFromDate = fromDate ? new Date(fromDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const searchToDate = toDate ? new Date(toDate) : new Date();
        
        // Use custom filter query if available, otherwise default
        const baseQuery = filterSettings?.filter_query || 'has:attachment subject:invoice OR subject:faktura OR subject:fakturę OR subject:faktury';
        const dateQuery = `after:${searchFromDate.toISOString().split('T')[0]} before:${searchToDate.toISOString().split('T')[0]}`;
        const query = `${baseQuery} ${dateQuery}`;
        
        console.log(`🔍 Gmail search query: ${query}`);
        const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`;
        console.log(`📧 Searching Gmail for ${userEmail} with URL: ${searchUrl}`);
        
        const searchResponse = await fetch(searchUrl, {
          headers: { Authorization: `Bearer ${access_token}` }
        });

        if (!searchResponse.ok) {
          const errorText = await searchResponse.text();
          console.error(`Gmail API search failed for ${userEmail}:`, errorText);
          console.error(`Status: ${searchResponse.status}, Query: ${query}`);
          continue;
        }

        const searchResult = await searchResponse.json();
        const messages = searchResult.messages || [];
        
        console.log(`Found ${messages.length} potential invoice emails for ${userEmail}`);

        for (const message of messages.slice(0, 10)) { // Process max 10 per run
          try {
            // CRITICAL: Check if message was processed for ANY user BEFORE processing (prevent cross-user duplicates)
            const { data: existingInvoice } = await supabase
              .from('invoices')
              .select('id, user_id')
              .eq('gmail_message_id', message.id)
              .maybeSingle();
            
            console.log(`Checking for existing invoice for message ${message.id} and user ${connectionUserId}:`, existingInvoice);

            if (existingInvoice) {
              // CRITICAL SECURITY CHECK: If invoice exists but for different user - this is expected for shared/forwarded emails
              if (existingInvoice.user_id !== tokenUserId) {
                console.log(`⚠️ CROSS-USER MESSAGE DETECTED: Message ${message.id} already processed for user ${existingInvoice.user_id}, skipping for user ${tokenUserId} (this is normal for forwarded/shared emails)`);
                await supabase.rpc('audit_user_data_access', {
                  p_user_id: tokenUserId,
                  p_operation: 'message_cross_user_skipped',
                  p_table_name: 'invoices',
                  p_details: { 
                    message_id: message.id, 
                    existing_user: existingInvoice.user_id,
                    skipped_user: tokenUserId,
                    reason: 'message_already_processed'
                  }
                });
                continue;
              }
              console.log(`Message ${message.id} already processed for current user ${tokenUserId}, skipping`);
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

                const fileName = `${tokenUserId}/${Date.now()}-${part.filename}`;
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

                // CRITICAL SECURITY: Validate connection ownership before creating invoice
                if (!tokenUserId) {
                  console.error(`🚨 CRITICAL: tokenUserId is null for connection ${userEmail}`);
                  continue;
                }

                // CRITICAL: Log invoice creation attempt with security audit
                console.log(`✅ SECURITY VALIDATED: Creating invoice for connection owner ${tokenUserId}, email: ${userEmail}, message: ${message.id}`);
                await supabase.rpc('audit_user_data_access', {
                  p_user_id: tokenUserId,
                  p_operation: 'invoice_creation_attempt',
                  p_table_name: 'invoices',
                  p_details: { 
                    message_id: message.id,
                    connection_email: userEmail,
                    source: 'gmail-processor'
                  }
                });

                // CRITICAL SECURITY: Use user_id from connection destructuring
                const { data: invoiceData, error: invoiceError } = await supabase
                  .from('invoices')
                  .insert({
                    user_id: tokenUserId, // CRITICAL: Use user_id from token function for absolute isolation
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
                  console.error(`❌ FAILED to create invoice for user ${tokenUserId}:`, invoiceError);
                  await supabase.rpc('audit_user_data_access', {
                    p_user_id: tokenUserId,
                    p_operation: 'invoice_creation_FAILED',
                    p_table_name: 'invoices',
                    p_details: { 
                      message_id: message.id,
                      error: invoiceError.message
                    }
                  });
                  continue;
                }

                console.log(`✅ SECURITY VALIDATED INVOICE for USER ${tokenUserId}: ${part.filename} from ${senderEmail}, ID: ${invoiceData.id}, Verified User: ${invoiceData.user_id}`);

                // Trigger OCR processing with proper user_id validation
                try {
                  await supabase.functions.invoke('ocr-processor', {
                    body: { 
                      invoiceId: invoiceData.id, 
                      userId: tokenUserId // Use tokenUserId for consistency - this is the actual owner
                    }
                  });
                } catch (ocrError) {
                  console.error('Failed to trigger OCR:', ocrError);
                }

                totalProcessed++;
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