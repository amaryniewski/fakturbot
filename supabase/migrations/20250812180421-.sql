-- Secure the mailbox_tokens table and implement proper token encryption

-- First, let's check if tokens in mailbox_tokens are currently encrypted
-- If not, we need to encrypt existing tokens

-- Drop the overly permissive ALL policy and create specific, secure policies
DROP POLICY IF EXISTS "Users can access tokens for their company mailboxes" ON public.mailbox_tokens;

-- Create specific, restrictive policies for mailbox_tokens
CREATE POLICY "Company members can insert mailbox tokens" ON public.mailbox_tokens
    FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.mailboxes m
            WHERE m.id = mailbox_id AND is_member(m.company_id)
        )
    );

CREATE POLICY "Company members can update their mailbox tokens" ON public.mailbox_tokens
    FOR UPDATE 
    USING (
        EXISTS (
            SELECT 1 FROM public.mailboxes m
            WHERE m.id = mailbox_id AND is_member(m.company_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.mailboxes m
            WHERE m.id = mailbox_id AND is_member(m.company_id)
        )
    );

CREATE POLICY "Company members can delete their mailbox tokens" ON public.mailbox_tokens
    FOR DELETE 
    USING (
        EXISTS (
            SELECT 1 FROM public.mailboxes m
            WHERE m.id = mailbox_id AND is_member(m.company_id)
        )
    );

-- NO SELECT policy on mailbox_tokens - tokens should only be accessed via secure functions

-- Create secure functions for safe mailbox metadata access
CREATE OR REPLACE FUNCTION public.get_safe_mailbox_connections()
RETURNS TABLE(
    id uuid,
    email text,
    provider text,
    server text,
    port integer,
    status text,
    created_at timestamp with time zone,
    last_sync_at timestamp with time zone,
    company_id uuid,
    has_tokens boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT 
        m.id,
        m.email,
        m.provider::text,
        m.server,
        m.port,
        m.status::text,
        m.created_at,
        m.last_sync_at,
        m.company_id,
        (mt.mailbox_id IS NOT NULL) as has_tokens
    FROM public.mailboxes m
    LEFT JOIN public.mailbox_tokens mt ON m.id = mt.mailbox_id
    WHERE is_member(m.company_id);
$function$;

-- Enhance the existing get_decrypted_mailbox_tokens with additional security and logging
CREATE OR REPLACE FUNCTION public.get_decrypted_mailbox_tokens(p_mailbox_id uuid)
 RETURNS TABLE(access_token text, refresh_token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Enhanced validation using our security helper
    IF NOT public.can_access_connection_tokens(p_mailbox_id, 'mailbox_tokens') THEN
        RAISE EXCEPTION 'Mailbox tokens not found or access denied';
    END IF;
    
    -- Log the token access for security audit
    PERFORM public.log_token_access('decrypt_mailbox_tokens', 'mailbox_tokens', p_mailbox_id);
    
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

-- Create function to revoke mailbox tokens
CREATE OR REPLACE FUNCTION public.revoke_mailbox_tokens(p_mailbox_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Validate access
    IF NOT public.can_access_connection_tokens(p_mailbox_id, 'mailbox_tokens') THEN
        RAISE EXCEPTION 'Mailbox not found or access denied';
    END IF;
    
    -- Log the revocation
    PERFORM public.log_token_access('revoke_mailbox_tokens', 'mailbox_tokens', p_mailbox_id);
    
    -- Delete the tokens
    DELETE FROM public.mailbox_tokens 
    WHERE mailbox_id = p_mailbox_id;
    
    RETURN FOUND;
END;
$function$;

-- Update can_access_connection_tokens to properly handle mailbox_tokens validation
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
            WHERE m.id = p_connection_id AND is_member(m.company_id)
        );
    END IF;
    
    RETURN false;
END;
$function$;