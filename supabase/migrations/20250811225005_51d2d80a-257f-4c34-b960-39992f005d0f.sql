-- Fix search path for is_member function to improve security
CREATE OR REPLACE FUNCTION public.is_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.memberships 
    WHERE memberships.company_id = p_company_id
      AND memberships.user_id = auth.uid()
  );
$$;