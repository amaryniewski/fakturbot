-- Fix encrypt_token and decrypt_token functions with proper type casting
DROP FUNCTION IF EXISTS public.encrypt_token(text);
DROP FUNCTION IF EXISTS public.decrypt_token(text);

CREATE OR REPLACE FUNCTION public.encrypt_token(token_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
SET search_path = ''
AS $$
  SELECT encode(digest(('fakturbot_salt_2024' || token_value)::text, 'sha256'::text), 'base64'::text) || '::' || 
         encode(encrypt_iv(token_value::bytea, 'fakturbot_key_2024_secure_token_encryption'::text, 
                          digest('fakturbot_salt_2024'::text, 'sha256'::text)::bytea, 'aes'::text), 'base64'::text);
$$;

CREATE OR REPLACE FUNCTION public.decrypt_token(encrypted_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
SET search_path = ''
AS $$
  SELECT convert_from(
    decrypt_iv(
      decode(split_part(encrypted_value, '::', 2), 'base64'::text),
      'fakturbot_key_2024_secure_token_encryption'::text,
      digest('fakturbot_salt_2024'::text, 'sha256'::text)::bytea,
      'aes'::text
    ), 'UTF8'::name
  );
$$;