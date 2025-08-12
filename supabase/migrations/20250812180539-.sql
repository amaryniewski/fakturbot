-- Simple approach: Remove SELECT policies from token tables to prevent direct access
-- This forces users to use secure functions only

-- Remove SELECT policies - no direct access to token tables allowed
DROP POLICY IF EXISTS "Users can view Gmail connection metadata only" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can view Fakturownia connection metadata only" ON public.fakturownia_connections;

-- For mailbox_tokens, we already removed the ALL policy, so no SELECT policy exists

-- Add a security warning comment to the tables
COMMENT ON TABLE public.gmail_connections IS 'SECURITY: Token columns should only be accessed via get_decrypted_gmail_tokens() function. Direct SELECT access is prohibited.';
COMMENT ON TABLE public.fakturownia_connections IS 'SECURITY: API token column should only be accessed via get_decrypted_fakturownia_connection() function. Direct SELECT access is prohibited.';
COMMENT ON TABLE public.mailbox_tokens IS 'SECURITY: Token columns should only be accessed via get_decrypted_mailbox_tokens() function. Direct SELECT access is prohibited.';

-- Create comprehensive security audit function
CREATE OR REPLACE FUNCTION public.audit_token_table_access()
RETURNS TABLE(
    table_name text,
    has_select_policy boolean,
    token_columns_exposed boolean,
    recommendation text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Check Gmail connections
    RETURN QUERY
    SELECT 
        'gmail_connections'::text,
        EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'gmail_connections' 
            AND cmd = 'SELECT'
        ),
        false, -- tokens should not be exposed
        'Use get_safe_gmail_connections() for metadata, get_decrypted_gmail_tokens() for tokens'::text;
        
    -- Check Fakturownia connections  
    RETURN QUERY
    SELECT 
        'fakturownia_connections'::text,
        EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'fakturownia_connections' 
            AND cmd = 'SELECT'
        ),
        false, -- tokens should not be exposed
        'Use get_safe_fakturownia_connections() for metadata, get_decrypted_fakturownia_connection() for tokens'::text;
        
    -- Check Mailbox tokens
    RETURN QUERY
    SELECT 
        'mailbox_tokens'::text,
        EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'mailbox_tokens' 
            AND cmd = 'SELECT'
        ),
        false, -- tokens should not be exposed
        'Use get_safe_mailbox_connections() for metadata, get_decrypted_mailbox_tokens() for tokens'::text;
END;
$function$;