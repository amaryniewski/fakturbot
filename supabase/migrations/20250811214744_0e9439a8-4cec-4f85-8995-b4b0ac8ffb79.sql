-- Update insert_encrypted_fakturownia_connection to work with service role
-- Add explicit user_id parameter to bypass auth.uid() requirement

DROP FUNCTION IF EXISTS public.insert_encrypted_fakturownia_connection(text, text, text);

CREATE OR REPLACE FUNCTION public.insert_encrypted_fakturownia_connection(
    p_user_id uuid,
    p_company_name text,
    p_domain text,
    p_api_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    connection_id uuid;
BEGIN
    -- Validate user ID is provided
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required';
    END IF;
    
    INSERT INTO public.fakturownia_connections (
        user_id,
        company_name,
        domain,
        api_token
    ) VALUES (
        p_user_id,
        p_company_name,
        p_domain,
        encrypt_token(p_api_token)
    ) 
    ON CONFLICT (user_id, domain) 
    DO UPDATE SET
        company_name = p_company_name,
        api_token = encrypt_token(p_api_token),
        is_active = true,
        updated_at = now()
    RETURNING id INTO connection_id;
    
    RETURN connection_id;
END;
$$;