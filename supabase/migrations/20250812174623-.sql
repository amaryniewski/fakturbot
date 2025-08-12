-- Create a service function to insert Gmail connection with explicit user_id
-- This is needed for OAuth callbacks where we can't use auth.uid()
CREATE OR REPLACE FUNCTION public.insert_encrypted_gmail_connection_for_user(
    p_user_id uuid,
    p_email text, 
    p_access_token text, 
    p_refresh_token text, 
    p_token_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    connection_id uuid;
BEGIN
    -- Validate user_id is provided
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required';
    END IF;
    
    INSERT INTO public.gmail_connections (
        user_id,
        email,
        access_token,
        refresh_token,
        token_expires_at
    ) VALUES (
        p_user_id,
        p_email,
        encrypt_token(p_access_token),
        encrypt_token(p_refresh_token),
        p_token_expires_at
    ) RETURNING id INTO connection_id;
    
    RETURN connection_id;
END;
$function$;