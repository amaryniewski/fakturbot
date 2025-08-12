-- Create a service role accessible function to get all Gmail connections for processing
CREATE OR REPLACE FUNCTION public.get_all_active_gmail_connections()
RETURNS TABLE(id uuid, email text, user_id uuid, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- This function can only be called by service role for background processing
  SELECT 
    gc.id,
    gc.email,
    gc.user_id,
    gc.created_at
  FROM public.gmail_connections gc
  WHERE gc.is_active = true;
$$;