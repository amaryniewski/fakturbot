-- Fix critical security vulnerability: encrypt Gmail OAuth tokens using built-in encryption
-- Create a more secure approach using database functions with proper encryption

-- First, let's add encrypted columns and migrate data
ALTER TABLE public.gmail_connections 
ADD COLUMN IF NOT EXISTS access_token_encrypted text,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted text;

-- Create encryption/decryption functions using pgcrypto
-- Note: This uses a fixed salt which should be replaced with a proper key management system in production
CREATE OR REPLACE FUNCTION encrypt_token(token_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
AS $$
  SELECT encode(digest('fakturbot_salt_2024' || token_value, 'sha256'), 'base64') || '::' || 
         encode(encrypt_iv(token_value::bytea, 'fakturbot_key_2024_secure_token_encryption', 
                          digest('fakturbot_salt_2024', 'sha256')::bytea, 'aes'), 'base64');
$$;

CREATE OR REPLACE FUNCTION decrypt_token(encrypted_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
AS $$
  SELECT convert_from(
    decrypt_iv(
      decode(split_part(encrypted_value, '::', 2), 'base64'),
      'fakturbot_key_2024_secure_token_encryption',
      digest('fakturbot_salt_2024', 'sha256')::bytea,
      'aes'
    ), 'UTF8'
  );
$$;

-- Migrate existing unencrypted data to encrypted format
UPDATE public.gmail_connections 
SET 
    access_token_encrypted = CASE 
        WHEN access_token IS NOT NULL AND access_token != '' THEN encrypt_token(access_token)
        ELSE NULL 
    END,
    refresh_token_encrypted = CASE 
        WHEN refresh_token IS NOT NULL AND refresh_token != '' THEN encrypt_token(refresh_token)
        ELSE NULL 
    END
WHERE (access_token_encrypted IS NULL AND access_token IS NOT NULL) 
   OR (refresh_token_encrypted IS NULL AND refresh_token IS NOT NULL);

-- Now safely drop the old unencrypted columns and rename
ALTER TABLE public.gmail_connections 
DROP COLUMN IF EXISTS access_token,
DROP COLUMN IF EXISTS refresh_token;

ALTER TABLE public.gmail_connections 
RENAME COLUMN access_token_encrypted TO access_token;
ALTER TABLE public.gmail_connections 
RENAME COLUMN refresh_token_encrypted TO refresh_token;

-- Create secure functions for token operations
CREATE OR REPLACE FUNCTION insert_encrypted_gmail_connection(
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
    -- Validate user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
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

CREATE OR REPLACE FUNCTION get_decrypted_gmail_tokens(p_connection_id uuid)
RETURNS TABLE(
    access_token text,
    refresh_token text,
    email text,
    token_expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Validate user owns this connection
    IF NOT EXISTS (
        SELECT 1 FROM public.gmail_connections 
        WHERE id = p_connection_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Connection not found or access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        decrypt_token(gc.access_token) as access_token,
        decrypt_token(gc.refresh_token) as refresh_token,
        gc.email,
        gc.token_expires_at
    FROM public.gmail_connections gc
    WHERE gc.id = p_connection_id AND gc.user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION update_encrypted_gmail_tokens(
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
        access_token = encrypt_token(p_access_token),
        refresh_token = CASE 
            WHEN p_refresh_token IS NOT NULL THEN encrypt_token(p_refresh_token)
            ELSE refresh_token 
        END,
        token_expires_at = COALESCE(p_token_expires_at, token_expires_at),
        updated_at = now()
    WHERE id = p_connection_id 
    AND user_id = auth.uid();
    
    RETURN FOUND;
END;
$$;