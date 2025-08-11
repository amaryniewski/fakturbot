import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ImapConnectionRequest {
  email: string;
  password: string;
  server: string;
  port: number;
  secure: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email, password, server, port, secure }: ImapConnectionRequest = await req.json();

    // Get the authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Invalid authentication');
    }

    // Test IMAP connection (mock for now - would use real IMAP library in production)
    console.log(`Testing IMAP connection to ${server}:${port} for ${email}`);
    
    // Mock validation - in real implementation, you'd test the actual IMAP connection
    if (!email.includes('@') || !server || port < 1 || port > 65535) {
      throw new Error('Invalid IMAP configuration');
    }

    // Check if mailbox already exists
    const { data: existingMailbox } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('email', email)
      .eq('provider', 'imap')
      .single();

    if (existingMailbox) {
      throw new Error('Mailbox already connected');
    }

    // Create a company for the user if it doesn't exist
    let companyId: string;
    const { data: existingMembership } = await supabase
      .from('memberships')
      .select('company_id')
      .eq('user_id', user.id)
      .single();

    if (existingMembership) {
      companyId = existingMembership.company_id;
    } else {
      // Create new company
      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert([{ name: `${email.split('@')[1]} Company` }])
        .select('id')
        .single();

      if (companyError) throw companyError;
      companyId = newCompany.id;

      // Create membership
      const { error: membershipError } = await supabase
        .from('memberships')
        .insert([{
          user_id: user.id,
          company_id: companyId,
          role: 'admin'
        }]);

      if (membershipError) throw membershipError;
    }

    // Insert mailbox
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .insert([{
        company_id: companyId,
        email: email,
        provider: 'imap',
        server: server,
        port: port,
        status: 'active'
      }])
      .select('id')
      .single();

    if (mailboxError) throw mailboxError;

    // Store encrypted credentials
    const { error: tokenError } = await supabase.rpc('insert_encrypted_mailbox_tokens', {
      p_mailbox_id: mailbox.id,
      p_access_token: password, // For IMAP, we store password as access_token
      p_refresh_token: null,
      p_expires_at: null
    });

    if (tokenError) throw tokenError;

    console.log(`Successfully connected IMAP mailbox: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        mailboxId: mailbox.id,
        message: 'IMAP mailbox connected successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in imap-connect function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
};

serve(handler);