-- Clear all existing data to start fresh
DELETE FROM public.invoice_items;
DELETE FROM public.invoices; 
DELETE FROM public.gmail_connections;
DELETE FROM public.fakturownia_connections;
DELETE FROM public.gmail_filter_settings;

-- Clear storage bucket files (this will be handled separately)
-- Note: Storage files will need to be cleared via storage API

-- Add additional security validation function
CREATE OR REPLACE FUNCTION public.validate_user_access(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Ensure the requesting user matches the data owner
    RETURN p_user_id = auth.uid();
END;
$$;

-- Create audit log for data access
CREATE OR REPLACE FUNCTION public.log_data_access(p_action text, p_table_name text, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (auth.uid(), p_action || '_' || p_table_name, p_table_name, p_user_id);
END;
$$;

-- Enhanced RPC function that properly validates user access
CREATE OR REPLACE FUNCTION public.get_user_gmail_connections_secure()
RETURNS TABLE(id uuid, email text, user_id uuid, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Log the access attempt
    PERFORM public.log_data_access('list', 'gmail_connections', auth.uid());
    
    -- Return only connections for the authenticated user
    RETURN QUERY
    SELECT 
        gc.id,
        gc.email,
        gc.user_id,
        gc.created_at
    FROM public.gmail_connections gc
    WHERE gc.user_id = auth.uid() 
      AND gc.is_active = true;
END;
$$;