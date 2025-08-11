-- Create secure views that exclude sensitive token data
CREATE OR REPLACE VIEW public.fakturownia_connections_safe AS
SELECT 
  id,
  user_id,
  company_name,
  domain,
  is_active,
  created_at,
  updated_at
FROM public.fakturownia_connections;

CREATE OR REPLACE VIEW public.gmail_connections_safe AS
SELECT 
  id,
  user_id,
  email,
  is_active,
  created_at,
  updated_at,
  token_expires_at
FROM public.gmail_connections;

-- Enable RLS on the views
ALTER VIEW public.fakturownia_connections_safe SET (security_invoker = true);
ALTER VIEW public.gmail_connections_safe SET (security_invoker = true);

-- Create RLS policies for the safe views
CREATE POLICY "Users can view their own Fakturownia connections (safe view)" 
ON public.fakturownia_connections_safe
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own Gmail connections (safe view)" 
ON public.gmail_connections_safe
FOR SELECT 
USING (auth.uid() = user_id);

-- Revoke direct access to sensitive columns in the original tables
-- Update existing policies to prevent direct token access
DROP POLICY IF EXISTS "Users can view their own Fakturownia connections" ON public.fakturownia_connections;
DROP POLICY IF EXISTS "Users can view their own Gmail connections" ON public.gmail_connections;

-- Create new restrictive policies that prevent direct token access
CREATE POLICY "Users can view their own Fakturownia connections (no tokens)" 
ON public.fakturownia_connections
FOR SELECT 
USING (false); -- Prevent direct SELECT on main table

CREATE POLICY "Users can view their own Gmail connections (no tokens)" 
ON public.gmail_connections
FOR SELECT 
USING (false); -- Prevent direct SELECT on main table

-- Keep other policies for INSERT, UPDATE, DELETE as they were
-- These are needed for the application to function

-- Add a security definer function to safely check connection existence
CREATE OR REPLACE FUNCTION public.check_fakturownia_connection_exists(p_domain text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
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
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.gmail_connections 
    WHERE user_id = auth.uid() 
    AND email = p_email 
    AND is_active = true
  );
$$;

-- Add function to get connection IDs safely (without tokens)
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
AS $$
  SELECT 
    id,
    company_name,
    domain,
    is_active,
    created_at,
    updated_at
  FROM public.fakturownia_connections 
  WHERE user_id = auth.uid();
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
AS $$
  SELECT 
    id,
    email,
    is_active,
    created_at,
    updated_at,
    token_expires_at
  FROM public.gmail_connections 
  WHERE user_id = auth.uid();
$$;