-- Create correct is_member function that uses memberships table
CREATE OR REPLACE FUNCTION public.is_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.memberships 
    WHERE memberships.company_id = p_company_id
      AND memberships.user_id = auth.uid()
  );
$$;