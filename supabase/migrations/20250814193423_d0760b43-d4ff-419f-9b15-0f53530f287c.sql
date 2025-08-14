-- CRITICAL TRIGGER: Enforce Gmail message ownership on invoice creation/update
CREATE OR REPLACE FUNCTION public.enforce_gmail_message_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- CRITICAL: user_id cannot be null EVER
    IF NEW.user_id IS NULL THEN
        RAISE EXCEPTION 'CRITICAL SECURITY: Invoice user_id cannot be null. Operation DENIED.';
    END IF;
    
    -- CRITICAL: If not service_role, user_id MUST match authenticated user
    IF current_setting('role') != 'service_role' AND NEW.user_id != auth.uid() THEN
        RAISE EXCEPTION 'CRITICAL SECURITY: Invoice user_id % does not match authenticated user %. Cross-user data access DENIED.', NEW.user_id, auth.uid();
    END IF;
    
    -- CRITICAL: Validate Gmail message ownership if gmail_message_id provided
    IF NEW.gmail_message_id IS NOT NULL THEN
        IF NOT public.validate_invoice_gmail_ownership(NEW.user_id, NEW.gmail_message_id) THEN
            RAISE EXCEPTION 'CRITICAL SECURITY: Gmail message % already belongs to another user. Cross-user data violation DENIED.', NEW.gmail_message_id;
        END IF;
    END IF;
    
    -- Log all invoice operations for audit
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (NEW.user_id, 'invoice_created_strict_isolation_enforced', 'invoices', NEW.id);
    
    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS enforce_gmail_message_ownership_trigger ON public.invoices;
CREATE TRIGGER enforce_gmail_message_ownership_trigger
    BEFORE INSERT OR UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.enforce_gmail_message_ownership();