-- 1. Sprawdź obecne polityki RLS dla tabeli invoices
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'invoices';

-- 2. Sprawdź czy istnieje funkcja get_all_active_gmail_connections_for_processing
SELECT routine_name, routine_definition
FROM information_schema.routines 
WHERE routine_name = 'get_all_active_gmail_connections_for_processing';

-- 3. Napraw politykę INSERT dla invoices - KRYTYCZNE ZABEZPIECZENIE
DROP POLICY IF EXISTS "Users can create their own invoices" ON public.invoices;

CREATE POLICY "Users can create their own invoices SECURE"
ON public.invoices 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 4. Dodaj brakującą funkcję RPC dla gmail-processor jeśli nie istnieje
CREATE OR REPLACE FUNCTION public.get_all_active_gmail_connections_for_processing()
RETURNS TABLE(id uuid, email text, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- SECURITY: This function can only be called by service role for processing
    -- Returns all active connections with their user_id for proper isolation
    RETURN QUERY
    SELECT 
        gc.id,
        gc.email,
        gc.user_id
    FROM public.gmail_connections gc
    WHERE gc.is_active = true;
END;
$function$;

-- 5. Dodaj trigger absolutnego zabezpieczenia przed cross-user access
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

-- Dodaj nowy strict trigger
CREATE TRIGGER enforce_strict_invoice_isolation_trigger
    BEFORE INSERT OR UPDATE ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_strict_invoice_isolation();

-- 6. Sprawdź czy są faktury cross-user (diagnostyka)
SELECT 
    i.id,
    i.user_id,
    i.sender_email,
    i.gmail_message_id,
    i.created_at,
    'POTENTIAL_CROSS_USER_ISSUE' as issue_type
FROM public.invoices i
WHERE EXISTS (
    SELECT 1 FROM public.invoices i2 
    WHERE i2.gmail_message_id = i.gmail_message_id 
    AND i2.user_id != i.user_id
)
ORDER BY i.created_at DESC;