-- Fix search_path security warning
CREATE OR REPLACE FUNCTION public.log_token_access(
    p_action text,
    p_table_name text, 
    p_record_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (auth.uid(), p_action, p_table_name, p_record_id);
END;
$function$;