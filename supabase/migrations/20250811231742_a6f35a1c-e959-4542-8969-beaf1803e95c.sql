-- Fix function search path security warnings by setting search_path
CREATE OR REPLACE FUNCTION public.get_user_fakturownia_connections()
RETURNS TABLE(
  id uuid,
  company_name text,
  domain text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    fc.id,
    fc.company_name,
    fc.domain,
    fc.is_active,
    fc.created_at,
    fc.updated_at
  FROM public.fakturownia_connections fc
  WHERE fc.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_user_gmail_connections()
RETURNS TABLE(
  id uuid,
  email text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  token_expires_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    gc.id,
    gc.email,
    gc.is_active,
    gc.created_at,
    gc.updated_at,
    gc.token_expires_at
  FROM public.gmail_connections gc
  WHERE gc.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.check_fakturownia_connection_exists(p_domain text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.fakturownia_connections 
    WHERE user_id = auth.uid() 
    AND domain = p_domain 
    AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.check_gmail_connection_exists(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.gmail_connections 
    WHERE user_id = auth.uid() 
    AND email = p_email 
    AND is_active = true
  );
$$;