-- Remove Security Definer views and replace with secure functions
DROP VIEW IF EXISTS public.safe_gmail_connections;
DROP VIEW IF EXISTS public.safe_fakturownia_connections;

-- Create secure functions instead of views to provide safe access to connection metadata
CREATE OR REPLACE FUNCTION public.get_safe_gmail_connections()
RETURNS TABLE(
    id uuid,
    email text,
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    token_expires_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT 
        gc.id,
        gc.email,
        gc.is_active,
        gc.created_at,
        gc.updated_at,
        gc.token_expires_at
    FROM public.gmail_connections gc
    WHERE gc.user_id = auth.uid() AND gc.is_active = true;
$function$;

CREATE OR REPLACE FUNCTION public.get_safe_fakturownia_connections()
RETURNS TABLE(
    id uuid,
    company_name text,
    domain text,
    is_active boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT 
        fc.id,
        fc.company_name,
        fc.domain,
        fc.is_active,
        fc.created_at,
        fc.updated_at
    FROM public.fakturownia_connections fc
    WHERE fc.user_id = auth.uid() AND fc.is_active = true;
$function$;

-- Add function to revoke/disable connections for additional security
CREATE OR REPLACE FUNCTION public.revoke_connection(
    p_connection_id uuid,
    p_connection_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Log the revocation action
    PERFORM public.log_token_access('revoke_connection', p_connection_type, p_connection_id);
    
    IF p_connection_type = 'gmail' THEN
        UPDATE public.gmail_connections 
        SET is_active = false, updated_at = now()
        WHERE id = p_connection_id AND user_id = auth.uid();
        
        RETURN FOUND;
    ELSIF p_connection_type = 'fakturownia' THEN
        UPDATE public.fakturownia_connections 
        SET is_active = false, updated_at = now()
        WHERE id = p_connection_id AND user_id = auth.uid();
        
        RETURN FOUND;
    END IF;
    
    RETURN false;
END;
$function$;