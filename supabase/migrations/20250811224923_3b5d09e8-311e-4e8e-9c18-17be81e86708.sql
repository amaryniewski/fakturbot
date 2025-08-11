-- Drop existing is_member function and create new one for user membership check
DROP FUNCTION IF EXISTS public.is_member(uuid);

-- Create is_member function to check if user is a member of any company
CREATE OR REPLACE FUNCTION public.is_member(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.company_members 
    WHERE company_members.user_id = $1
  );
$$;