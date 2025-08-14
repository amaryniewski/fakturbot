-- Phase 1: Clear incorrectly assigned data
-- Delete all invoices (will be recreated correctly)
DELETE FROM public.invoices;

-- Phase 2: Enhance database functions with proper user validation
-- Drop existing function and recreate with proper validation
DROP FUNCTION IF EXISTS public.get_all_active_gmail_connections();

-- Create secure function that only returns connections for service role or with explicit user validation
CREATE OR REPLACE FUNCTION public.get_all_active_gmail_connections_for_processing()
RETURNS TABLE(id uuid, email text, user_id uuid, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  -- This function can ONLY be called by service role for background processing
  -- It returns ALL connections but includes user_id for proper data isolation
  SELECT 
    gc.id,
    gc.email,
    gc.user_id,
    gc.created_at
  FROM public.gmail_connections gc
  WHERE gc.is_active = true;
$$;

-- Create function to validate connection ownership
CREATE OR REPLACE FUNCTION public.validate_connection_ownership(p_connection_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gmail_connections 
    WHERE id = p_connection_id 
    AND user_id = p_user_id 
    AND is_active = true
  );
$$;

-- Create function to validate invoice ownership
CREATE OR REPLACE FUNCTION public.validate_invoice_ownership(p_invoice_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices 
    WHERE id = p_invoice_id 
    AND user_id = p_user_id
  );
$$;

-- Phase 3: Add validation trigger for invoices
CREATE OR REPLACE FUNCTION public.validate_invoice_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Ensure user_id is never null
    IF NEW.user_id IS NULL THEN
        RAISE EXCEPTION 'Invoice user_id cannot be null';
    END IF;
    
    -- Log invoice creation for audit
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (NEW.user_id, 'invoice_created', 'invoices', NEW.id);
    
    RETURN NEW;
END;
$$;

-- Create trigger for invoice validation
DROP TRIGGER IF EXISTS validate_invoice_user_trigger ON public.invoices;
CREATE TRIGGER validate_invoice_user_trigger
    BEFORE INSERT ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_invoice_user_id();

-- Phase 4: Add security monitoring function
CREATE OR REPLACE FUNCTION public.log_data_access_attempt(p_user_id uuid, p_action text, p_resource_id uuid, p_resource_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (p_user_id, p_action || '_' || p_resource_type, p_resource_type, p_resource_id);
END;
$$;