-- Fix remaining token table security gaps
-- Apply the same security hardening to mailbox_tokens and improve mailboxes protection

-- === MAILBOX TOKENS SECURITY HARDENING ===

-- Drop the conflicting policies that allow company member access to token data
DROP POLICY IF EXISTS "Company members can insert mailbox tokens" ON public.mailbox_tokens;
DROP POLICY IF EXISTS "Company members can update their mailbox tokens" ON public.mailbox_tokens;
DROP POLICY IF EXISTS "Company members can delete their mailbox tokens" ON public.mailbox_tokens;

-- Create comprehensive denial policies for all operations
-- Only allow access through designated secure functions
CREATE POLICY "Deny all mailbox_tokens access"
ON public.mailbox_tokens
FOR ALL 
USING (false)
WITH CHECK (false);

-- === SECURE MAILBOX TOKENS MANAGEMENT FUNCTIONS ===

-- Create secure function for inserting mailbox tokens
CREATE OR REPLACE FUNCTION public.insert_encrypted_mailbox_tokens_secure(
    p_mailbox_id uuid, 
    p_access_token text, 
    p_refresh_token text DEFAULT NULL,
    p_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Validate user has access to this mailbox through company membership
    IF NOT EXISTS (
        SELECT 1 FROM public.mailboxes m 
        WHERE m.id = p_mailbox_id AND is_member(m.company_id)
    ) THEN
        RAISE EXCEPTION 'Access denied to mailbox';
    END IF;
    
    -- Log the token creation for security audit
    PERFORM public.log_token_access('create_mailbox_tokens', 'mailbox_tokens', p_mailbox_id);
    
    -- Insert or update tokens with encryption
    INSERT INTO public.mailbox_tokens (
        mailbox_id,
        access_token,
        refresh_token,
        expires_at
    ) VALUES (
        p_mailbox_id,
        encrypt_token(p_access_token),
        CASE WHEN p_refresh_token IS NOT NULL THEN encrypt_token(p_refresh_token) ELSE NULL END,
        p_expires_at
    )
    ON CONFLICT (mailbox_id) 
    DO UPDATE SET
        access_token = encrypt_token(p_access_token),
        refresh_token = CASE WHEN p_refresh_token IS NOT NULL THEN encrypt_token(p_refresh_token) ELSE mailbox_tokens.refresh_token END,
        expires_at = COALESCE(p_expires_at, mailbox_tokens.expires_at);
    
    RETURN TRUE;
END;
$$;

-- Create secure function for updating mailbox tokens
CREATE OR REPLACE FUNCTION public.update_encrypted_mailbox_tokens_secure(
    p_mailbox_id uuid, 
    p_access_token text, 
    p_refresh_token text DEFAULT NULL,
    p_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Validate user has access to this mailbox through company membership
    IF NOT EXISTS (
        SELECT 1 FROM public.mailboxes m 
        WHERE m.id = p_mailbox_id AND is_member(m.company_id)
    ) THEN
        RAISE EXCEPTION 'Access denied to mailbox';
    END IF;
    
    -- Log the token update for security audit
    PERFORM public.log_token_access('update_mailbox_tokens', 'mailbox_tokens', p_mailbox_id);
    
    UPDATE public.mailbox_tokens 
    SET 
        access_token = encrypt_token(p_access_token),
        refresh_token = CASE 
            WHEN p_refresh_token IS NOT NULL THEN encrypt_token(p_refresh_token)
            ELSE refresh_token 
        END,
        expires_at = COALESCE(p_expires_at, expires_at)
    WHERE mailbox_id = p_mailbox_id;
    
    RETURN FOUND;
END;
$$;

-- === AUDIT LOG SECURITY HARDENING ===

-- The security_audit_log table should be completely protected from user manipulation
-- Only system functions should be able to insert, users can only read their own logs

CREATE POLICY "Deny audit log manipulation"
ON public.security_audit_log
FOR INSERT
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny audit log updates"
ON public.security_audit_log
FOR UPDATE
USING (false)
WITH CHECK (false);

CREATE POLICY "Deny audit log deletion"
ON public.security_audit_log
FOR DELETE
USING (false);