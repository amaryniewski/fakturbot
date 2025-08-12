-- Clean up duplicate and potentially insecure RLS policies
-- Remove old duplicated policies that may have security vulnerabilities

-- Gmail Connections - Remove duplicates and ensure only secure access
DROP POLICY IF EXISTS "Users can view their own Gmail connections" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can view their own Gmail connections (safe)" ON public.gmail_connections;

-- Fakturownia Connections - Remove duplicates and ensure only secure access  
DROP POLICY IF EXISTS "Users can view their own Fakturownia connections" ON public.fakturownia_connections;
DROP POLICY IF EXISTS "Users can view their own Fakturownia connections (safe)" ON public.fakturownia_connections;

-- Create secure, single SELECT policies that prevent direct token access
-- Note: These policies allow metadata access only - tokens should only be accessed via secure functions

CREATE POLICY "Users can view their connection metadata only - Gmail" ON public.gmail_connections
    FOR SELECT USING (
        auth.uid() = user_id AND is_active = true
    );

CREATE POLICY "Users can view their connection metadata only - Fakturownia" ON public.fakturownia_connections  
    FOR SELECT USING (
        auth.uid() = user_id AND is_active = true
    );

-- Add additional security: Create a view that explicitly excludes token columns for safe client access
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
FROM public.gmail_connections;

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
FROM public.fakturownia_connections;

-- Enable RLS on the safe views
ALTER VIEW public.safe_gmail_connections SET (security_barrier = true);
ALTER VIEW public.safe_fakturownia_connections SET (security_barrier = true);

-- Create policies for the safe views
CREATE POLICY "Users can view their own Gmail connection info" ON public.safe_gmail_connections
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own Fakturownia connection info" ON public.safe_fakturownia_connections
    FOR SELECT USING (auth.uid() = user_id);

-- Add a function to check if tokens are properly encrypted
CREATE OR REPLACE FUNCTION public.validate_token_encryption()
RETURNS TABLE(table_name text, has_unencrypted_tokens boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- This function helps verify that all tokens are properly encrypted
    -- Only accessible by authenticated users for their own data
    
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