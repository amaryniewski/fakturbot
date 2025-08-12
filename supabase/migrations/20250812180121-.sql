-- Clean up duplicate RLS policies and strengthen security
-- Remove old duplicated policies that may have security vulnerabilities

-- Gmail Connections - Remove duplicates
DROP POLICY IF EXISTS "Users can view their own Gmail connections" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can view their own Gmail connections (safe)" ON public.gmail_connections;

-- Fakturownia Connections - Remove duplicates
DROP POLICY IF EXISTS "Users can view their own Fakturownia connections" ON public.fakturownia_connections;
DROP POLICY IF EXISTS "Users can view their own Fakturownia connections (safe)" ON public.fakturownia_connections;

-- Strengthen existing metadata-only policies with additional security checks
DROP POLICY IF EXISTS "Users can view Gmail connection metadata only" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can view Fakturownia connection metadata only" ON public.fakturownia_connections;

CREATE POLICY "Users can view Gmail connection metadata only" ON public.gmail_connections
    FOR SELECT USING (
        auth.uid() = user_id AND is_active = true
    );

CREATE POLICY "Users can view Fakturownia connection metadata only" ON public.fakturownia_connections  
    FOR SELECT USING (
        auth.uid() = user_id AND is_active = true
    );

-- Create safe views that exclude sensitive token columns
CREATE OR REPLACE VIEW public.safe_gmail_connections AS
SELECT 
    id,
    user_id,
    email,
    is_active,
    created_at,
    updated_at,
    token_expires_at
    -- Deliberately exclude access_token and refresh_token columns
FROM public.gmail_connections
WHERE user_id = auth.uid() AND is_active = true;

CREATE OR REPLACE VIEW public.safe_fakturownia_connections AS  
SELECT 
    id,
    user_id,
    company_name,
    domain,
    is_active,
    created_at,
    updated_at
    -- Deliberately exclude api_token column  
FROM public.fakturownia_connections
WHERE user_id = auth.uid() AND is_active = true;

-- Add additional security validation function
CREATE OR REPLACE FUNCTION public.validate_token_encryption()
RETURNS TABLE(table_name text, has_unencrypted_tokens boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Verify tokens are properly encrypted for current user only
    RETURN QUERY
    SELECT 'gmail_connections'::text, 
           EXISTS(
               SELECT 1 FROM public.gmail_connections 
               WHERE user_id = auth.uid() 
               AND (access_token NOT LIKE '%::%' OR refresh_token NOT LIKE '%::%')
           );
           
    RETURN QUERY  
    SELECT 'fakturownia_connections'::text,
           EXISTS(
               SELECT 1 FROM public.fakturownia_connections
               WHERE user_id = auth.uid()
               AND api_token NOT LIKE '%::%'
           );
END;
$function$;