-- Add audit logging for sensitive token access
CREATE TABLE IF NOT EXISTS public.security_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id),
    action text NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins or the user themselves can view their audit logs
CREATE POLICY "Users can view their own audit logs" ON public.security_audit_log
    FOR SELECT USING (auth.uid() = user_id);

-- Add security restrictions to token columns (prevent direct access)
-- Remove any overly permissive SELECT policies on token columns
DROP POLICY IF EXISTS "Users can view their own Gmail connections (safe)" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can view their own Fakturownia connections (safe)" ON public.fakturownia_connections;

-- Function to log sensitive operations
CREATE OR REPLACE FUNCTION public.log_token_access(
    p_action text,
    p_table_name text, 
    p_record_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (auth.uid(), p_action, p_table_name, p_record_id);
END;
$function$;

-- Update token retrieval functions to include audit logging
CREATE OR REPLACE FUNCTION public.get_decrypted_gmail_tokens(p_connection_id uuid)
 RETURNS TABLE(access_token text, refresh_token text, email text, token_expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Enhanced validation with proper error handling
    IF NOT public.can_access_connection_tokens(p_connection_id, 'gmail_connections') THEN
        RAISE EXCEPTION 'Gmail connection not found or access denied';
    END IF;
    
    -- Log the token access for security audit
    PERFORM public.log_token_access('decrypt_gmail_tokens', 'gmail_connections', p_connection_id);
    
    RETURN QUERY
    SELECT 
        decrypt_token(gc.access_token) as access_token,
        decrypt_token(gc.refresh_token) as refresh_token,
        gc.email,
        gc.token_expires_at
    FROM public.gmail_connections gc
    WHERE gc.id = p_connection_id 
      AND gc.user_id = auth.uid() 
      AND gc.is_active = true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_decrypted_fakturownia_connection(p_connection_id uuid)
 RETURNS TABLE(company_name text, domain text, api_token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- SECURITY FIX: Validate user owns this connection
    IF NOT EXISTS (
        SELECT 1 FROM public.fakturownia_connections 
        WHERE id = p_connection_id AND user_id = auth.uid() AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Connection not found or access denied';
    END IF;
    
    -- Log the token access for security audit
    PERFORM public.log_token_access('decrypt_fakturownia_token', 'fakturownia_connections', p_connection_id);
    
    RETURN QUERY
    SELECT 
        fc.company_name,
        fc.domain,
        public.decrypt_token(fc.api_token) as api_token
    FROM public.fakturownia_connections fc
    WHERE fc.id = p_connection_id 
      AND fc.user_id = auth.uid() 
      AND fc.is_active = true;
END;
$function$;