-- Fix search_path for is_member function
CREATE OR REPLACE FUNCTION public.is_member(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $function$
  select exists (
    select 1
    from public.memberships m
    where m.company_id = p_company_id
      and m.user_id = auth.uid()
  );
$function$