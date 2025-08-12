-- Final security fixes: Remove all direct token column access from SELECT policies
-- Replace with column-specific grants that exclude sensitive token fields

-- Drop existing SELECT policies that expose token columns  
DROP POLICY IF EXISTS "Users can view Gmail connection metadata only" ON public.gmail_connections;
DROP POLICY IF EXISTS "Users can view Fakturownia connection metadata only" ON public.fakturownia_connections;

-- Create new SELECT policies with explicit column restrictions (excluding tokens)
-- Note: PostgreSQL RLS doesn't support column-level restrictions in policies,
-- so we'll use a different approach - revoke table-level SELECT and grant specific permissions

-- Revoke default SELECT permissions on sensitive tables
REVOKE SELECT ON public.gmail_connections FROM authenticated;
REVOKE SELECT ON public.fakturownia_connections FROM authenticated;  
REVOKE SELECT ON public.mailbox_tokens FROM authenticated;

-- Create secure views that explicitly exclude token columns
CREATE OR REPLACE VIEW public.gmail_connections_safe AS
SELECT 
    id,
    user_id,
    email,
    is_active,
    created_at,
    updated_at,
    token_expires_at
    -- Explicitly exclude: access_token, refresh_token
FROM public.gmail_connections;

CREATE OR REPLACE VIEW public.fakturownia_connections_safe AS
SELECT 
    id,
    user_id,
    company_name,
    domain,
    is_active,
    created_at,
    updated_at
    -- Explicitly exclude: api_token
FROM public.fakturownia_connections;

CREATE OR REPLACE VIEW public.mailbox_tokens_safe AS
SELECT 
    mailbox_id,
    expires_at
    -- Explicitly exclude: access_token, refresh_token
FROM public.mailbox_tokens;

-- Grant SELECT on the safe views with proper RLS
GRANT SELECT ON public.gmail_connections_safe TO authenticated;
GRANT SELECT ON public.fakturownia_connections_safe TO authenticated;
GRANT SELECT ON public.mailbox_tokens_safe TO authenticated;

-- Enable RLS on the views and create policies
ALTER VIEW public.gmail_connections_safe SET (security_barrier = true);
ALTER VIEW public.fakturownia_connections_safe SET (security_barrier = true); 
ALTER VIEW public.mailbox_tokens_safe SET (security_barrier = true);

-- Apply row-level security to the views
CREATE POLICY "Users can view their Gmail connection metadata" ON public.gmail_connections_safe
    FOR SELECT USING (
        user_id = auth.uid() AND is_active = true
    );

CREATE POLICY "Users can view their Fakturownia connection metadata" ON public.fakturownia_connections_safe
    FOR SELECT USING (
        user_id = auth.uid() AND is_active = true
    );

CREATE POLICY "Company members can view mailbox metadata" ON public.mailbox_tokens_safe
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.mailboxes m
            WHERE m.id = mailbox_id AND is_member(m.company_id)
        )
    );

-- Update the get_user_gmail_connections function to use the safe view
CREATE OR REPLACE FUNCTION public.get_user_gmail_connections()
 RETURNS TABLE(id uuid, email text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, token_expires_at timestamp with time zone)
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
  FROM public.gmail_connections_safe gc
  WHERE gc.user_id = auth.uid();
$function$;

-- Update the get_user_fakturownia_connections function to use the safe view
CREATE OR REPLACE FUNCTION public.get_user_fakturownia_connections()
 RETURNS TABLE(id uuid, company_name text, domain text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
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
  FROM public.fakturownia_connections_safe fc
  WHERE fc.user_id = auth.uid();
$function$;