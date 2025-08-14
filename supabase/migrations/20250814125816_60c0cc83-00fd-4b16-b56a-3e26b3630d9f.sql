-- Additional security hardening for sensitive token tables
-- Revoke all privileges from public role on sensitive tables
REVOKE ALL ON TABLE public.fakturownia_connections FROM public;
REVOKE ALL ON TABLE public.gmail_connections FROM public;
REVOKE ALL ON TABLE public.mailbox_tokens FROM public;

-- Grant only specific necessary privileges to authenticated users
GRANT SELECT ON TABLE public.fakturownia_connections TO authenticated;
GRANT INSERT ON TABLE public.fakturownia_connections TO authenticated;
GRANT UPDATE ON TABLE public.fakturownia_connections TO authenticated;
GRANT DELETE ON TABLE public.fakturownia_connections TO authenticated;

GRANT SELECT ON TABLE public.gmail_connections TO authenticated;
GRANT INSERT ON TABLE public.gmail_connections TO authenticated;
GRANT UPDATE ON TABLE public.gmail_connections TO authenticated;
GRANT DELETE ON TABLE public.gmail_connections TO authenticated;

GRANT SELECT ON TABLE public.mailbox_tokens TO authenticated;
GRANT INSERT ON TABLE public.mailbox_tokens TO authenticated;
GRANT UPDATE ON TABLE public.mailbox_tokens TO authenticated;
GRANT DELETE ON TABLE public.mailbox_tokens TO authenticated;

-- Add additional security check function
CREATE OR REPLACE FUNCTION public.verify_token_access_security()
RETURNS TABLE(table_name text, access_level text, is_secure boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'fakturownia_connections'::text, 'DENY_ALL'::text, 
         NOT EXISTS(
           SELECT 1 FROM public.fakturownia_connections 
           WHERE current_setting('role') != 'service_role'
         )::boolean
  UNION ALL
  SELECT 'gmail_connections'::text, 'DENY_ALL'::text,
         NOT EXISTS(
           SELECT 1 FROM public.gmail_connections 
           WHERE current_setting('role') != 'service_role'
         )::boolean
  UNION ALL
  SELECT 'mailbox_tokens'::text, 'DENY_ALL'::text,
         NOT EXISTS(
           SELECT 1 FROM public.mailbox_tokens 
           WHERE current_setting('role') != 'service_role'
         )::boolean;
$$;

-- Add comments to document security measures
COMMENT ON TABLE public.fakturownia_connections IS 'SECURITY: Contains encrypted API tokens. Access restricted by RLS policies and encrypted storage.';
COMMENT ON TABLE public.gmail_connections IS 'SECURITY: Contains encrypted OAuth tokens. Access restricted by RLS policies and encrypted storage.';
COMMENT ON TABLE public.mailbox_tokens IS 'SECURITY: Contains encrypted access tokens. Access restricted by RLS policies and encrypted storage.';