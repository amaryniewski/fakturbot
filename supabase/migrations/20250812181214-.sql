-- Fix conflicting RLS policies for OAuth tokens and API keys
-- Remove the conflicting user-specific policies and ensure complete token isolation

-- === GMAIL CONNECTIONS SECURITY HARDENING ===

-- Drop the conflicting policies that allowed user access to token data
DROP POLICY IF EXISTS "Users can create their own Gmail connections" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can update their own Gmail connections" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can delete their own Gmail connections" ON public.gmail_connections;

-- Create comprehensive denial policies for all operations
-- Only allow access through designated secure functions
CREATE POLICY "Deny all gmail_connections access"
ON public.gmail_connections
FOR ALL 
USING (false)
WITH CHECK (false);

-- === FAKTUROWNIA CONNECTIONS SECURITY HARDENING ===

-- Drop the conflicting policies that allowed user access to token data  
DROP POLICY IF EXISTS "Users can create their own Fakturownia connections" ON public.fakturownia_connections;
DROP POLICY IF EXISTS "Users can update their own Fakturownia connections" ON public.fakturownia_connections;
DROP POLICY IF EXISTS "Users can delete their own Fakturownia connections" ON public.fakturownia_connections;

-- Create comprehensive denial policies for all operations
-- Only allow access through designated secure functions
CREATE POLICY "Deny all fakturownia_connections access"
ON public.fakturownia_connections
FOR ALL 
USING (false)
WITH CHECK (false);

-- === UPDATE EXISTING SECURE FUNCTIONS FOR PROPER ACCESS ===

-- Update the Gmail connection function to handle user validation internally
CREATE OR REPLACE FUNCTION public.insert_encrypted_gmail_connection_secure(
    p_email text, 
    p_access_token text, 
    p_refresh_token text, 
    p_token_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    connection_id uuid;
BEGIN
    -- Validate user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    -- Log the connection creation for security audit
    PERFORM public.log_token_access('create_gmail_connection', 'gmail_connections', NULL);
    
    INSERT INTO public.gmail_connections (
        user_id,
        email,
        access_token,
        refresh_token,
        token_expires_at
    ) VALUES (
        auth.uid(),
        p_email,
        encrypt_token(p_access_token),
        encrypt_token(p_refresh_token),
        p_token_expires_at
    ) RETURNING id INTO connection_id;
    
    RETURN connection_id;
END;
$$;

-- Update the Fakturownia connection function to handle user validation internally
CREATE OR REPLACE FUNCTION public.insert_encrypted_fakturownia_connection_secure(
    p_company_name text, 
    p_domain text, 
    p_api_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    connection_id uuid;
BEGIN
    -- Validate user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    -- Log the connection creation for security audit
    PERFORM public.log_token_access('create_fakturownia_connection', 'fakturownia_connections', NULL);
    
    INSERT INTO public.fakturownia_connections (
        user_id,
        company_name,
        domain,
        api_token
    ) VALUES (
        auth.uid(),
        p_company_name,
        p_domain,
        public.encrypt_token(p_api_token)
    ) 
    ON CONFLICT (user_id, domain) 
    DO UPDATE SET
        company_name = p_company_name,
        api_token = public.encrypt_token(p_api_token),
        is_active = true,
        updated_at = now()
    RETURNING id INTO connection_id;
    
    RETURN connection_id;
END;
$$;