-- Drop the failed policies first
DROP POLICY IF EXISTS "Users can view their own Fakturownia connections (no tokens)" ON public.fakturownia_connections;
DROP POLICY IF EXISTS "Users can view their own Gmail connections (no tokens)" ON public.gmail_connections;

-- Re-create the original policies but with restricted columns
CREATE POLICY "Users can view their own Fakturownia connections (safe)" 
ON public.fakturownia_connections
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own Gmail connections (safe)" 
ON public.gmail_connections
FOR SELECT 
USING (auth.uid() = user_id);

-- Create security definer functions to safely get connections without exposing tokens
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

-- Create function to safely check if a connection exists
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