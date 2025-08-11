-- Create get_decrypted_fakturownia_connection function
CREATE OR REPLACE FUNCTION public.get_decrypted_fakturownia_connection(p_connection_id uuid)
RETURNS TABLE(
    company_name text,
    domain text, 
    api_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Validate user has access to this connection (through user_id check)
    -- Note: This function is called by service role, so we don't use auth.uid() check here
    -- Access control is handled at the Edge Function level
    
    RETURN QUERY
    SELECT 
        fc.company_name,
        fc.domain,
        public.decrypt_token(fc.api_token) as api_token
    FROM public.fakturownia_connections fc
    WHERE fc.id = p_connection_id AND fc.is_active = true;
END;
$$;