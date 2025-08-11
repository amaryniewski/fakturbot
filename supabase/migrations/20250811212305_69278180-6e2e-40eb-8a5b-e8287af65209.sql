-- Secure mailbox tokens with encryption
-- Create functions to safely handle mailbox token encryption/decryption

-- Function to insert encrypted mailbox tokens
CREATE OR REPLACE FUNCTION public.insert_encrypted_mailbox_tokens(
  p_mailbox_id uuid,
  p_access_token text,
  p_refresh_token text DEFAULT NULL,
  p_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Validate user has access to this mailbox through company membership
    IF NOT EXISTS (
        SELECT 1 FROM public.mailboxes m 
        WHERE m.id = p_mailbox_id AND is_member(m.company_id)
    ) THEN
        RAISE EXCEPTION 'Access denied to mailbox';
    END IF;
    
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

-- Function to get decrypted mailbox tokens
CREATE OR REPLACE FUNCTION public.get_decrypted_mailbox_tokens(p_mailbox_id uuid)
RETURNS TABLE(
    access_token text, 
    refresh_token text, 
    expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Validate user has access to this mailbox through company membership
    IF NOT EXISTS (
        SELECT 1 FROM public.mailboxes m 
        WHERE m.id = p_mailbox_id AND is_member(m.company_id)
    ) THEN
        RAISE EXCEPTION 'Access denied to mailbox';
    END IF;
    
    RETURN QUERY
    SELECT 
        decrypt_token(mt.access_token) as access_token,
        CASE WHEN mt.refresh_token IS NOT NULL THEN decrypt_token(mt.refresh_token) ELSE NULL END as refresh_token,
        mt.expires_at
    FROM public.mailbox_tokens mt
    WHERE mt.mailbox_id = p_mailbox_id;
END;
$$;

-- Function to update mailbox tokens
CREATE OR REPLACE FUNCTION public.update_encrypted_mailbox_tokens(
  p_mailbox_id uuid,
  p_access_token text,
  p_refresh_token text DEFAULT NULL,
  p_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Validate user has access to this mailbox through company membership
    IF NOT EXISTS (
        SELECT 1 FROM public.mailboxes m 
        WHERE m.id = p_mailbox_id AND is_member(m.company_id)
    ) THEN
        RAISE EXCEPTION 'Access denied to mailbox';
    END IF;
    
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

-- Encrypt existing tokens in the table (migration step)
-- WARNING: This assumes existing data format - run only once
DO $$
DECLARE
    token_record RECORD;
BEGIN
    -- Only proceed if there are unencrypted tokens (check for pattern that indicates encryption)
    FOR token_record IN 
        SELECT mailbox_id, access_token, refresh_token 
        FROM public.mailbox_tokens 
        WHERE access_token NOT LIKE '%::%'  -- Not already encrypted
    LOOP
        UPDATE public.mailbox_tokens 
        SET 
            access_token = encrypt_token(token_record.access_token),
            refresh_token = CASE 
                WHEN token_record.refresh_token IS NOT NULL 
                THEN encrypt_token(token_record.refresh_token) 
                ELSE NULL 
            END
        WHERE mailbox_id = token_record.mailbox_id;
    END LOOP;
END;
$$;