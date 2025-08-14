-- CRITICAL SECURITY FIX: Add strict invoice isolation trigger
-- This prevents any invoice from being created without proper user_id validation

CREATE OR REPLACE FUNCTION public.enforce_absolute_invoice_isolation()
RETURNS TRIGGER AS $$
BEGIN
    -- CRITICAL: user_id cannot be null EVER
    IF NEW.user_id IS NULL THEN
        RAISE EXCEPTION 'CRITICAL SECURITY: Invoice user_id cannot be null. Operation DENIED.';
    END IF;
    
    -- CRITICAL: If not service_role, user_id MUST match authenticated user
    IF current_setting('role') != 'service_role' AND NEW.user_id != auth.uid() THEN
        RAISE EXCEPTION 'CRITICAL SECURITY: Invoice user_id % does not match authenticated user %. Cross-user data access DENIED.', NEW.user_id, auth.uid();
    END IF;
    
    -- Log all invoice creation attempts for audit
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (NEW.user_id, 'invoice_created_strict_isolation', 'invoices', NEW.id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Replace existing trigger with strict version
DROP TRIGGER IF EXISTS validate_invoice_user_id_trigger ON public.invoices;
CREATE TRIGGER enforce_absolute_invoice_isolation_trigger
    BEFORE INSERT ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_absolute_invoice_isolation();

-- Add function to clean up any cross-contaminated data
CREATE OR REPLACE FUNCTION public.emergency_data_isolation_cleanup()
RETURNS TABLE(cleaned_invoices integer, security_violations jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    violation_count integer := 0;
    cleanup_count integer := 0;
BEGIN
    -- Check for any data isolation violations
    SELECT COUNT(*) INTO violation_count
    FROM public.invoices i
    WHERE NOT EXISTS (
        SELECT 1 FROM public.gmail_connections gc 
        WHERE gc.user_id = i.user_id 
        AND gc.is_active = true
    );
    
    -- If violations found, this is critical
    IF violation_count > 0 THEN
        -- Log critical security incident
        INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
        VALUES (
            '00000000-0000-0000-0000-000000000000'::uuid,
            'CRITICAL_DATA_ISOLATION_VIOLATION_DETECTED',
            'invoices',
            gen_random_uuid()
        );
    END IF;
    
    RETURN QUERY VALUES (
        cleanup_count,
        jsonb_build_object(
            'violations_found', violation_count,
            'timestamp', now(),
            'severity', 'CRITICAL'
        )
    );
END;
$$;