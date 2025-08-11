-- Fix encrypt_token and decrypt_token functions with proper namespace
DROP FUNCTION IF EXISTS public.encrypt_token(text);
DROP FUNCTION IF EXISTS public.decrypt_token(text);

CREATE OR REPLACE FUNCTION public.encrypt_token(token_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
SET search_path = ''
AS $$
  SELECT encode(extensions.digest(('fakturbot_salt_2024' || token_value)::bytea, 'sha256'), 'base64') || '::' || 
         encode(extensions.encrypt_iv(token_value::bytea, 'fakturbot_key_2024_secure_token_encryption', 
                          extensions.digest('fakturbot_salt_2024'::bytea, 'sha256'), 'aes'), 'base64');
$$;

CREATE OR REPLACE FUNCTION public.decrypt_token(encrypted_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
SET search_path = ''
AS $$
  SELECT convert_from(
    extensions.decrypt_iv(
      decode(split_part(encrypted_value, '::', 2), 'base64'),
      'fakturbot_key_2024_secure_token_encryption',
      extensions.digest('fakturbot_salt_2024'::bytea, 'sha256'),
      'aes'
    ), 'UTF8'
  );
$$;