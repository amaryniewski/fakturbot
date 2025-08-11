-- Fix critical security vulnerability: encrypt Gmail OAuth tokens
-- First, create a secure key for token encryption if not exists
DO $$
BEGIN
    -- Create encryption key if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gmail_token_encryption_key') THEN
        INSERT INTO vault.secrets (name, secret) 
        VALUES ('gmail_token_encryption_key', encode(gen_random_bytes(32), 'base64'));
    END IF;
END $$;

-- Create helper functions for secure token management
CREATE OR REPLACE FUNCTION encrypt_gmail_token(token_value text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    encryption_key text;
BEGIN
    -- Get the encryption key from vault
    SELECT decrypted_secret INTO encryption_key 
    FROM vault.decrypted_secrets 
    WHERE name = 'gmail_token_encryption_key';
    
    -- Return encrypted token using the key
    RETURN vault.encrypt(token_value, encryption_key);
END;
$$;

CREATE OR REPLACE FUNCTION decrypt_gmail_token(encrypted_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    encryption_key text;
BEGIN
    -- Get the encryption key from vault
    SELECT decrypted_secret INTO encryption_key 
    FROM vault.decrypted_secrets 
    WHERE name = 'gmail_token_encryption_key';
    
    -- Return decrypted token using the key
    RETURN vault.decrypt(encrypted_token, encryption_key);
END;
$$;

-- Add new encrypted columns
ALTER TABLE public.gmail_connections 
ADD COLUMN IF NOT EXISTS access_token_encrypted text,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;

-- Migrate existing data to encrypted format
UPDATE public.gmail_connections 
SET 
    access_token_encrypted = CASE 
        WHEN access_token IS NOT NULL THEN encrypt_gmail_token(access_token)
        ELSE NULL 
    END,
    refresh_token_encrypted = encrypt_gmail_token(refresh_token)
WHERE access_token_encrypted IS NULL OR refresh_token_encrypted IS NULL;

-- Drop the old unencrypted columns
ALTER TABLE public.gmail_connections 
DROP COLUMN IF EXISTS access_token,
DROP COLUMN IF EXISTS refresh_token;

-- Rename encrypted columns to original names
ALTER TABLE public.gmail_connections 
RENAME COLUMN access_token_encrypted TO access_token;
ALTER TABLE public.gmail_connections 
RENAME COLUMN refresh_token_encrypted TO refresh_token;

-- Create a secure view for accessing decrypted tokens (only for authorized operations)
CREATE OR REPLACE VIEW gmail_connections_decrypted AS
SELECT 
    id,
    user_id,
    email,
    created_at,
    updated_at,
    token_expires_at,
    is_active,
    decrypt_gmail_token(access_token) as access_token,
    decrypt_gmail_token(refresh_token) as refresh_token
FROM public.gmail_connections
WHERE auth.uid() = user_id; -- Only show decrypted data to token owner

-- Grant necessary permissions
GRANT SELECT ON gmail_connections_decrypted TO authenticated;

-- Create secure functions for token operations
CREATE OR REPLACE FUNCTION insert_gmail_connection(
    p_email text,
    p_access_token text,
    p_refresh_token text,
    p_token_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    connection_id uuid;
BEGIN
    INSERT INTO public.gmail_connections (
        user_id,
        email,
        access_token,
        refresh_token,
        token_expires_at
    ) VALUES (
        auth.uid(),
        p_email,
        encrypt_gmail_token(p_access_token),
        encrypt_gmail_token(p_refresh_token),
        p_token_expires_at
    ) RETURNING id INTO connection_id;
    
    RETURN connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_gmail_tokens(
    p_connection_id uuid,
    p_access_token text,
    p_refresh_token text DEFAULT NULL,
    p_token_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.gmail_connections 
    SET 
        access_token = encrypt_gmail_token(p_access_token),
        refresh_token = CASE 
            WHEN p_refresh_token IS NOT NULL THEN encrypt_gmail_token(p_refresh_token)
            ELSE refresh_token 
        END,
        token_expires_at = COALESCE(p_token_expires_at, token_expires_at),
        updated_at = now()
    WHERE id = p_connection_id 
    AND user_id = auth.uid();
    
    RETURN FOUND;
END;
$$;