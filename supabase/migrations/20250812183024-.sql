-- Fix the Gmail token function to include user_id for proper processing
CREATE OR REPLACE FUNCTION public.get_decrypted_gmail_tokens_with_user(p_connection_id uuid)
RETURNS TABLE(access_token text, refresh_token text, email text, token_expires_at timestamp with time zone, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Enhanced validation with proper error handling
    IF NOT EXISTS (
        SELECT 1 FROM public.gmail_connections 
        WHERE id = p_connection_id AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Gmail connection not found or access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        decrypt_token(gc.access_token) as access_token,
        decrypt_token(gc.refresh_token) as refresh_token,
        gc.email,
        gc.token_expires_at,
        gc.user_id
    FROM public.gmail_connections gc
    WHERE gc.id = p_connection_id 
      AND gc.is_active = true;
END;
$$;