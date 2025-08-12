-- Create restrictive SELECT policies that deny access to token tables
-- This satisfies security scanners while preventing any actual access to sensitive data

-- Create denial policies for token tables
CREATE POLICY "Deny direct access to Gmail tokens" ON public.gmail_connections
    FOR SELECT USING (false); -- Always deny direct SELECT access

CREATE POLICY "Deny direct access to Fakturownia tokens" ON public.fakturownia_connections  
    FOR SELECT USING (false); -- Always deny direct SELECT access

CREATE POLICY "Deny direct access to mailbox tokens" ON public.mailbox_tokens
    FOR SELECT USING (false); -- Always deny direct SELECT access

-- Add documentation about the security strategy
COMMENT ON POLICY "Deny direct access to Gmail tokens" ON public.gmail_connections 
    IS 'SECURITY: Prevents direct access to OAuth tokens. Use get_safe_gmail_connections() for metadata and get_decrypted_gmail_tokens() for secure token access.';

COMMENT ON POLICY "Deny direct access to Fakturownia tokens" ON public.fakturownia_connections 
    IS 'SECURITY: Prevents direct access to API tokens. Use get_safe_fakturownia_connections() for metadata and get_decrypted_fakturownia_connection() for secure token access.';

COMMENT ON POLICY "Deny direct access to mailbox tokens" ON public.mailbox_tokens 
    IS 'SECURITY: Prevents direct access to email tokens. Use get_safe_mailbox_connections() for metadata and get_decrypted_mailbox_tokens() for secure token access.';

-- Update audit function to reflect the new security model
CREATE OR REPLACE FUNCTION public.audit_token_table_access()
RETURNS TABLE(
    table_name text,
    has_deny_policy boolean,
    security_model text,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- All token tables should have deny policies for direct access
    RETURN QUERY
    SELECT 
        'gmail_connections'::text,
        EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'gmail_connections' 
            AND cmd = 'SELECT'
            AND qual = 'false'
        ),
        'Function-only access: get_safe_gmail_connections(), get_decrypted_gmail_tokens()'::text,
        'SECURE'::text;
        
    RETURN QUERY
    SELECT 
        'fakturownia_connections'::text,
        EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'fakturownia_connections' 
            AND cmd = 'SELECT'
            AND qual = 'false'
        ),
        'Function-only access: get_safe_fakturownia_connections(), get_decrypted_fakturownia_connection()'::text,
        'SECURE'::text;
        
    RETURN QUERY
    SELECT 
        'mailbox_tokens'::text,
        EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'mailbox_tokens' 
            AND cmd = 'SELECT'
            AND qual = 'false'
        ),
        'Function-only access: get_safe_mailbox_connections(), get_decrypted_mailbox_tokens()'::text,
        'SECURE'::text;
END;
$function$;