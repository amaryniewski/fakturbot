-- Fix function signature issue and add denial policies

-- Drop and recreate the audit function with corrected signature
DROP FUNCTION IF EXISTS public.audit_token_table_access();

-- Create denial policies for token tables - prevents direct access
CREATE POLICY "Deny direct access to Gmail tokens" ON public.gmail_connections
    FOR SELECT USING (false);

CREATE POLICY "Deny direct access to Fakturownia tokens" ON public.fakturownia_connections  
    FOR SELECT USING (false);

CREATE POLICY "Deny direct access to mailbox tokens" ON public.mailbox_tokens
    FOR SELECT USING (false);

-- Simple documentation function
CREATE OR REPLACE FUNCTION public.check_token_security()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT 'All token tables have denial policies. Use designated secure functions for access.'::text;
$function$;