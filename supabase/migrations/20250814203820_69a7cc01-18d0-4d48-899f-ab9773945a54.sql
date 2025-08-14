-- Dodaj trigger absolutnego zabezpieczenia przed cross-user access
CREATE OR REPLACE FUNCTION public.enforce_strict_invoice_isolation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- CRITICAL: user_id nie może być null NIGDY
    IF NEW.user_id IS NULL THEN
        RAISE EXCEPTION 'CRITICAL SECURITY: Invoice user_id cannot be null. Operation DENIED.';
    END IF;
    
    -- CRITICAL: Jeśli nie service_role, user_id MUSI się zgadzać z zalogowanym użytkownikiem
    IF current_setting('role') != 'service_role' AND NEW.user_id != auth.uid() THEN
        RAISE EXCEPTION 'CRITICAL SECURITY: Invoice user_id % does not match authenticated user %. Cross-user data access DENIED.', NEW.user_id, auth.uid();
    END IF;
    
    -- Zaloguj wszystkie operacje dla audytu
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (NEW.user_id, 'invoice_created_strict_isolation_enforced', 'invoices', NEW.id);
    
    RETURN NEW;
END;
$function$;

-- Usuń stary trigger jeśli istnieje
DROP TRIGGER IF EXISTS enforce_invoice_isolation ON public.invoices;
DROP TRIGGER IF EXISTS enforce_strict_invoice_isolation_trigger ON public.invoices;

-- Dodaj nowy strict trigger
CREATE TRIGGER enforce_strict_invoice_isolation_trigger
    BEFORE INSERT OR UPDATE ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_strict_invoice_isolation();

-- Sprawdź czy są faktury cross-user aktualnie
SELECT 
    COUNT(*) as cross_user_count,
    'These invoices have the same gmail_message_id but different user_ids' as description
FROM (
    SELECT gmail_message_id
    FROM public.invoices 
    WHERE gmail_message_id IS NOT NULL
    GROUP BY gmail_message_id
    HAVING COUNT(DISTINCT user_id) > 1
) cross_user;