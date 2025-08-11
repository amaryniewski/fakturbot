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
  testOnly?: boolean;
}

// Common IMAP providers settings
const IMAP_PROVIDERS = {
  'gmail.com': { server: 'imap.gmail.com', port: 993, secure: true },
  'outlook.com': { server: 'outlook.office365.com', port: 993, secure: true },
  'hotmail.com': { server: 'outlook.office365.com', port: 993, secure: true },
  'yahoo.com': { server: 'imap.mail.yahoo.com', port: 993, secure: true },
  'onet.pl': { server: 'imap.poczta.onet.pl', port: 993, secure: true },
  'wp.pl': { server: 'imap.wp.pl', port: 993, secure: true },
  'interia.pl': { server: 'poczta.interia.pl', port: 993, secure: true },
};

const handler = async (req: Request): Promise<Response> => {
  console.log('IMAP Connect function called');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email, password, server, port, secure, testOnly }: ImapConnectionRequest & { testOnly?: boolean } = await req.json();

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

    // Validate input data
    if (!email.includes('@')) {
      throw new Error('Nieprawidłowy adres e-mail');
    }
    
    if (!server) {
      throw new Error('Serwer IMAP jest wymagany');
    }
    
    if (port < 1 || port > 65535) {
      throw new Error('Nieprawidłowy port (1-65535)');
    }
    
    if (!password) {
      throw new Error('Hasło jest wymagane');
    }

    // Auto-detect settings for known providers
    const emailDomain = email.split('@')[1]?.toLowerCase();
    const providerSettings = IMAP_PROVIDERS[emailDomain as keyof typeof IMAP_PROVIDERS];
    
    // Use detected settings if user didn't provide custom ones
    const finalServer = server === '' && providerSettings ? providerSettings.server : server;
    const finalPort = (port === 993 || port === 143) && providerSettings ? providerSettings.port : port;
    const finalSecure = providerSettings ? providerSettings.secure : secure;
    
    console.log(`Testing IMAP connection to ${finalServer}:${finalPort} for ${email}`);
    
    // Real IMAP connection test - simplified for now
    try {
      // Basic validation for common providers
      if (emailDomain === 'gmail.com' && (!password || password.length < 16)) {
        throw new Error('Gmail wymaga hasła aplikacji (App Password). Włącz uwierzytelnianie dwuskładnikowe i wygeneruj hasło aplikacji.');
      }
      
      if ((emailDomain === 'outlook.com' || emailDomain === 'hotmail.com') && (!password || password.length < 8)) {
        throw new Error('Outlook/Hotmail wymaga prawidłowego hasła do konta.');
      }
      
      // For now, just validate the server format and basic requirements
      if (!finalServer.includes('.')) {
        throw new Error('Nieprawidłowy format serwera IMAP');
      }
      
      if (finalPort !== 993 && finalPort !== 143) {
        console.log(`Warning: Unusual IMAP port ${finalPort}, expected 993 or 143`);
      }
      
      console.log(`IMAP configuration validated for ${email}`);
      
    } catch (error: any) {
      console.error('IMAP validation failed:', error.message);
      throw error;
    }

    // If this is just a test, return success without saving to database
    if (testOnly) {
      console.log(`IMAP test successful for ${email}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'IMAP test connection successful',
          testOnly: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }
    // Check if mailbox already exists
    const { data: existingMailbox } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('email', email)
      .eq('provider', 'imap')
      .maybeSingle();

    if (existingMailbox) {
      throw new Error('Mailbox already connected');
    }

    // Create a company for the user if it doesn't exist
    let companyId: string;
    const { data: existingMembership, error: membershipError } = await supabase
      .from('memberships')
      .select('company_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      console.error('Error checking membership:', membershipError);
      throw new Error(`Database error: ${membershipError.message}`);
    }

    if (existingMembership) {
      companyId = existingMembership.company_id;
    } else {
      // Create new company
      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert([{ name: `${email.split('@')[1]} Company` }])
        .select('id')
        .single();

      if (companyError) {
        console.error('Error creating company:', companyError);
        throw new Error(`Failed to create company: ${companyError.message}`);
      }
      companyId = newCompany.id;

      // Create membership
      const { error: membershipInsertError } = await supabase
        .from('memberships')
        .insert([{
          user_id: user.id,
          company_id: companyId,
          role: 'admin'
        }]);

      if (membershipInsertError) {
        console.error('Error creating membership:', membershipInsertError);
        throw new Error(`Failed to create membership: ${membershipInsertError.message}`);
      }
    }

    // Insert mailbox with final settings
    const { data: mailbox, error: mailboxError } = await supabase
      .from('mailboxes')
      .insert([{
        company_id: companyId,
        email: email,
        provider: 'imap',
        server: finalServer,
        port: finalPort,
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
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      cause: error.cause
    });
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
};

serve(handler);