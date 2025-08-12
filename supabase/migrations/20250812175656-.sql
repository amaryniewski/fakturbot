-- Fix security issue in get_decrypted_fakturownia_connection function
-- Add proper user ownership validation

CREATE OR REPLACE FUNCTION public.get_decrypted_fakturownia_connection(p_connection_id uuid)
 RETURNS TABLE(company_name text, domain text, api_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- SECURITY FIX: Validate user owns this connection
    IF NOT EXISTS (
        SELECT 1 FROM public.fakturownia_connections 
        WHERE id = p_connection_id AND user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Connection not found or access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        fc.company_name,
        fc.domain,
        public.decrypt_token(fc.api_token) as api_token
    FROM public.fakturownia_connections fc
    WHERE fc.id = p_connection_id 
      AND fc.user_id = auth.uid() 
      AND fc.is_active = true;
END;
$function$;

-- Add additional security function to validate token access
CREATE OR REPLACE FUNCTION public.can_access_connection_tokens(p_connection_id uuid, p_table_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Validate user has access to the connection tokens
    IF p_table_name = 'gmail_connections' THEN
        RETURN EXISTS (
            SELECT 1 FROM public.gmail_connections 
            WHERE id = p_connection_id AND user_id = auth.uid() AND is_active = true
        );
    ELSIF p_table_name = 'fakturownia_connections' THEN
        RETURN EXISTS (
            SELECT 1 FROM public.fakturownia_connections 
            WHERE id = p_connection_id AND user_id = auth.uid() AND is_active = true
        );
    ELSIF p_table_name = 'mailbox_tokens' THEN
        RETURN EXISTS (
            SELECT 1 FROM public.mailboxes m
            JOIN public.mailbox_tokens mt ON m.id = mt.mailbox_id
            WHERE mt.mailbox_id = p_connection_id AND is_member(m.company_id)
        );
    END IF;
    
    RETURN false;
END;
$function$;

-- Enhance get_decrypted_gmail_tokens for additional security logging
CREATE OR REPLACE FUNCTION public.get_decrypted_gmail_tokens(p_connection_id uuid)
 RETURNS TABLE(access_token text, refresh_token text, email text, token_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Enhanced validation with proper error handling
    IF NOT public.can_access_connection_tokens(p_connection_id, 'gmail_connections') THEN
        RAISE EXCEPTION 'Gmail connection not found or access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        decrypt_token(gc.access_token) as access_token,
        decrypt_token(gc.refresh_token) as refresh_token,
        gc.email,
        gc.token_expires_at
    FROM public.gmail_connections gc
    WHERE gc.id = p_connection_id 
      AND gc.user_id = auth.uid() 
      AND gc.is_active = true;
END;
$function$;

-- Enhance get_decrypted_mailbox_tokens for additional security
CREATE OR REPLACE FUNCTION public.get_decrypted_mailbox_tokens(p_mailbox_id uuid)
 RETURNS TABLE(access_token text, refresh_token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Enhanced validation
    IF NOT public.can_access_connection_tokens(p_mailbox_id, 'mailbox_tokens') THEN
        RAISE EXCEPTION 'Mailbox tokens not found or access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        decrypt_token(mt.access_token) as access_token,
        CASE WHEN mt.refresh_token IS NOT NULL THEN decrypt_token(mt.refresh_token) ELSE NULL END as refresh_token,
        mt.expires_at
    FROM public.mailbox_tokens mt
    JOIN public.mailboxes m ON m.id = mt.mailbox_id
    WHERE mt.mailbox_id = p_mailbox_id 
      AND is_member(m.company_id);
END;
$function$;