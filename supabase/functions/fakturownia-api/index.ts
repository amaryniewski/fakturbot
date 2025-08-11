import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FakturowniaRequest {
  action: 'test' | 'connect' | 'sync_invoices' | 'get_invoices' | 'create_invoice';
  domain?: string;
  apiToken?: string;
  companyName?: string;
  connectionId?: string;
  invoiceData?: any;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from JWT token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, domain, apiToken, companyName, connectionId, invoiceData }: FakturowniaRequest = await req.json();
    console.log('Fakturownia API request:', { action, domain, connectionId });

    switch (action) {
      case 'test': {
        if (!domain || !apiToken) {
          throw new Error('Domain and API token are required for testing');
        }

        // Test API connection by getting account info
        const testUrl = `https://${domain}.fakturownia.pl/account.json?api_token=${apiToken}`;
        const testResponse = await fetch(testUrl);
        
        if (!testResponse.ok) {
          throw new Error('Invalid API token or domain');
        }

        const accountData = await testResponse.json();
        console.log('Fakturownia test successful:', accountData.name);

        return new Response(JSON.stringify({ 
          success: true, 
          accountName: accountData.name 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'connect': {
        if (!domain || !apiToken || !companyName) {
          throw new Error('Domain, API token, and company name are required for connection');
        }

        // Test API connection first
        const testUrl = `https://${domain}.fakturownia.pl/account.json?api_token=${apiToken}`;
        const testResponse = await fetch(testUrl);
        
        if (!testResponse.ok) {
          throw new Error('Invalid API token or domain');
        }

        const accountData = await testResponse.json();
        console.log('Fakturownia connection test successful:', accountData.name);

        // Store encrypted connection using service role with user context
        const { data: connectionId, error: dbError } = await supabaseClient
          .rpc('insert_encrypted_fakturownia_connection', {
            p_company_name: companyName,
            p_domain: domain,
            p_api_token: apiToken
          });

        if (dbError) {
          console.error('Database error details:', JSON.stringify(dbError, null, 2));
          console.error('User ID:', user.id);
          console.error('Function params:', { companyName, domain });
          throw new Error(`Failed to save connection: ${dbError.message}`);
        }

        console.log('Fakturownia connection saved successfully:', connectionId);

        return new Response(JSON.stringify({ 
          success: true, 
          connectionId,
          accountName: accountData.name 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'sync_invoices': {
        if (!connectionId) {
          throw new Error('Connection ID is required for syncing');
        }

        // Get connection details securely
        const { data: connectionData, error: connError } = await supabaseClient
          .rpc('get_decrypted_fakturownia_connection', {
            p_connection_id: connectionId
          });

        if (connError || !connectionData?.[0]) {
          throw new Error('Connection not found');
        }

        const connection = connectionData[0];
        
        // Fetch invoices from current month
        const invoicesUrl = `https://${connection.domain}.fakturownia.pl/invoices.json?period=this_month&api_token=${connection.api_token}`;
        const invoicesResponse = await fetch(invoicesUrl);
        
        if (!invoicesResponse.ok) {
          throw new Error('Failed to fetch invoices from Fakturownia');
        }

        const invoices = await invoicesResponse.json();
        console.log(`Fetched ${invoices.length} invoices from Fakturownia`);

        // Process and store invoices in our database
        let processedCount = 0;
        for (const invoice of invoices) {
          try {
            // Insert invoice into our invoices table
            const { error: insertError } = await supabaseClient
              .from('invoices')
              .upsert({
                user_id: user.id,
                file_name: `Faktura_${invoice.number}.pdf`,
                sender_email: invoice.buyer_email || 'fakturownia@integration.com',
                subject: `Faktura ${invoice.number}`,
                received_at: invoice.issue_date,
                status: 'success',
                file_size: null,
                file_url: invoice.view_url,
              }, {
                onConflict: 'user_id,file_name'
              });

            if (!insertError) {
              processedCount++;
            }
          } catch (error) {
            console.error('Error processing invoice:', invoice.number, error);
          }
        }

        return new Response(JSON.stringify({ 
          success: true, 
          count: processedCount,
          total: invoices.length 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_invoices': {
        if (!connectionId) {
          throw new Error('Connection ID is required');
        }

        // Get connection details securely
        const { data: connectionData, error: connError } = await supabaseClient
          .rpc('get_decrypted_fakturownia_connection', {
            p_connection_id: connectionId
          });

        if (connError || !connectionData?.[0]) {
          throw new Error('Connection not found');
        }

        const connection = connectionData[0];
        
        // Fetch invoices
        const invoicesUrl = `https://${connection.domain}.fakturownia.pl/invoices.json?period=this_month&api_token=${connection.api_token}`;
        const invoicesResponse = await fetch(invoicesUrl);
        
        if (!invoicesResponse.ok) {
          throw new Error('Failed to fetch invoices');
        }

        const invoices = await invoicesResponse.json();

        return new Response(JSON.stringify({ 
          success: true, 
          invoices 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'create_invoice': {
        if (!connectionId || !invoiceData) {
          throw new Error('Connection ID and invoice data are required');
        }

        // Get connection details securely
        const { data: connectionData, error: connError } = await supabaseClient
          .rpc('get_decrypted_fakturownia_connection', {
            p_connection_id: connectionId
          });

        if (connError || !connectionData?.[0]) {
          throw new Error('Connection not found');
        }

        const connection = connectionData[0];
        
        // Create invoice in Fakturownia
        const createUrl = `https://${connection.domain}.fakturownia.pl/invoices.json?api_token=${connection.api_token}`;
        const createResponse = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ invoice: invoiceData }),
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.text();
          throw new Error(`Failed to create invoice: ${errorData}`);
        }

        const newInvoice = await createResponse.json();

        return new Response(JSON.stringify({ 
          success: true, 
          invoice: newInvoice 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error('Unknown action');
    }
  } catch (error: any) {
    console.error('Error in fakturownia-api function:', error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

serve(handler);