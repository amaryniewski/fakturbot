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
      parts?: Array<any>;
    }>;
  };
  internalDate: string;
}

// Recursive function to walk through all message parts
function* walkParts(p: any): Generator<any> {
  if (!p) return;
  if (Array.isArray(p)) {
    for (const x of p) yield* walkParts(x);
  } else {
    if (p.filename && p.body?.attachmentId) yield p;
    if (p.parts) yield* walkParts(p.parts);
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fromDate, toDate } = await req.json().catch(() => ({}));
    console.log('Gmail processor started with fromDate:', fromDate, 'toDate:', toDate);
    
    // Get user ID from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Missing or invalid Authorization header');
    }
    
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify token and get user ID
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      throw new Error('Invalid token or user not found');
    }
    
    const currentUserId = user.id;
    console.log(`🔒 Processing Gmail for authenticated user: ${currentUserId}`);
    
    // Get ONLY connections belonging to the authenticated user
    const { data: connections, error: connectionsError } = await supabase
      .from('gmail_connections')
      .select('id, email, user_id')
      .eq('user_id', currentUserId)
      .eq('is_active', true);

    if (connectionsError) {
      console.error('Failed to fetch connections:', connectionsError);
      throw new Error(`Failed to fetch connections: ${connectionsError.message}`);
    }

    console.log(`Processing ${connections?.length || 0} Gmail connections for user ${currentUserId}:`, connections?.map(c => c.email));
    
    let totalProcessed = 0;
    
    for (const connection of connections || []) {
      const { id: connectionId, email: userEmail, user_id: connectionUserId } = connection;
      console.log(`🔄 Processing connection: ${userEmail} for user: ${connectionUserId}`);
      
      // Security check: ensure connection belongs to authenticated user
      if (connectionUserId !== currentUserId) {
        console.error(`❌ CRITICAL: Connection ${connectionId} user_id ${connectionUserId} doesn't match authenticated user ${currentUserId}`);
        continue;
      }
      
      try {
        
        // Get decrypted tokens for this connection using the new function that includes user_id
        const { data: tokenData, error: tokenError } = await supabase
          .rpc('get_decrypted_gmail_tokens_with_user', { p_connection_id: connectionId });

        if (tokenError || !tokenData?.[0]) {
          console.error(`Failed to get tokens for ${userEmail}:`, tokenError);
          continue;
        }

        let { access_token, refresh_token, email: tokenEmail, token_expires_at, user_id: tokenUserId } = tokenData[0];
        
        // Verify that token email matches connection email
        if (tokenEmail && tokenEmail.toLowerCase() !== userEmail.toLowerCase()) {
          console.error(`Token email ${tokenEmail} ≠ connection email ${userEmail}`);
          continue;
        }
        
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
        
        // Get user's filter settings for the authenticated user
        const { data: filterSettings } = await supabase
          .from('gmail_filter_settings')
          .select('filter_query, allowed_sender_emails')
          .eq('user_id', currentUserId)
          .single();
        
        console.log(`Processing Gmail connection for user ${currentUserId}, email: ${userEmail}`);
        
        // Use fromDate if provided, otherwise default to last 7 days
        const searchFromDate = fromDate ? new Date(fromDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const searchToDate = toDate ? new Date(toDate) : new Date();
        
        // Use custom filter query if available, otherwise default with is:unread
        const baseQuery = filterSettings?.filter_query || 'has:attachment is:unread (subject:invoice OR subject:faktura OR subject:fakturę OR subject:faktury)';
        
        // Format dates for Gmail (YYYY/MM/DD)
        const formatDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '/');
        const dateQuery = `after:${formatDate(searchFromDate)} before:${formatDate(searchToDate)}`;
        const query = `${baseQuery} ${dateQuery}`;
        
        console.log(`🔍 Gmail search query: ${query}`);
        
        // Process all pages, not just first 10 messages
        let allMessages: any[] = [];
        let pageToken: string | undefined;
        
        do {
          const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
          url.searchParams.set('q', query);
          if (pageToken) url.searchParams.set('pageToken', pageToken);
          
          console.log(`📧 Searching Gmail for ${userEmail} with URL: ${url}`);
          
          const searchResponse = await fetch(url, {
            headers: { Authorization: `Bearer ${access_token}` }
          });

          if (!searchResponse.ok) {
            const errorText = await searchResponse.text();
            console.error(`Gmail API search failed for ${userEmail}:`, errorText);
            console.error(`Status: ${searchResponse.status}, Query: ${query}`);
            break;
          }

          const searchResult = await searchResponse.json();
          const messages = searchResult.messages || [];
          allMessages.push(...messages);
          pageToken = searchResult.nextPageToken;
          
          console.log(`Found ${messages.length} messages in this page, total so far: ${allMessages.length}`);
        } while (pageToken);
        
        console.log(`Found ${allMessages.length} total potential invoice emails for ${userEmail}`);

        for (const message of allMessages) {
          try {
            // CRITICAL: Use per-user deduplication - only check if THIS user already processed this message
            const ownerId = connection.user_id; // source of truth
            const { data: existingInvoice } = await supabase
              .from('invoices')
              .select('id')
              .eq('user_id', ownerId)
              .eq('gmail_message_id', message.id)
              .maybeSingle();
            
            console.log(`Checking for existing invoice for message ${message.id} and user ${ownerId}:`, existingInvoice);

            if (existingInvoice) {
              console.log(`Message ${message.id} already processed for user ${ownerId}, skipping`);
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

            // Find PDF attachments using recursive search through all parts
            for (const part of walkParts(messageData.payload?.parts || [])) {
              if (part.filename && part.filename.toLowerCase().includes('.pdf') && part.body.attachmentId) {
                
                // Download attachment
                const attachmentUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}/attachments/${part.body.attachmentId}`;
                const attachmentResponse = await fetch(attachmentUrl, {
                  headers: { Authorization: `Bearer ${access_token}` }
                });

                if (!attachmentResponse.ok) continue;

                const attachmentData = await attachmentResponse.json();
                const fileBuffer = Uint8Array.from(atob(attachmentData.data.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

                // CRITICAL: Use connection owner's user_id for storage path
                const ownerId = connection.user_id;
                const fileName = `${ownerId}/${Date.now()}-${part.filename}`;
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

                // Log invoice creation attempt
                console.log(`✅ Creating invoice for connection owner ${ownerId}, email: ${userEmail}, message: ${message.id}`);

                // CRITICAL: Create invoice with connection owner's user_id, not currentUserId
                const { data: invoiceData, error: invoiceError } = await supabase
                  .from('invoices')
                  .upsert({
                    user_id: ownerId, // Use connection owner's ID - source of truth
                    gmail_message_id: message.id,
                    sender_email: senderEmail,
                    subject: subject,
                    received_at: receivedDate.toISOString(),
                    file_name: part.filename,
                    file_size: fileBuffer.length,
                    file_url: publicUrl,
                    status: 'new',
                    needs_review: true
                  }, { 
                    onConflict: 'user_id,gmail_message_id',
                    ignoreDuplicates: true 
                  })
                  .select()
                  .single();

                if (invoiceError) {
                  console.error(`❌ FAILED to create invoice for user ${ownerId}:`, invoiceError);
                  continue;
                }

                console.log(`✅ Invoice created for USER ${ownerId}: ${part.filename} from ${senderEmail}, ID: ${invoiceData.id}`);

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