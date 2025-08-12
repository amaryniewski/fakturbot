-- Fix RLS policies - remove WITH CHECK from SELECT policies
DROP POLICY IF EXISTS "Users can view Gmail connection metadata only" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can view Fakturownia connection metadata only" ON public.fakturownia_connections;

-- Create proper SELECT policies that restrict token column access
CREATE POLICY "Users can view Gmail connection metadata only" ON public.gmail_connections
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view Fakturownia connection metadata only" ON public.fakturownia_connections  
    FOR SELECT USING (auth.uid() = user_id);

-- Add audit logging table
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

-- Only users can view their own audit logs
CREATE POLICY "Users can view their own audit logs" ON public.security_audit_log
    FOR SELECT USING (auth.uid() = user_id);

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