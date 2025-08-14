-- Faza 1: Natychmiastowe oczyszczenie błędnych danych
-- UWAGA: To usuwa WSZYSTKIE dane z faktur - są one błędnie przypisane między użytkownikami

-- Wyczyść wszystkie powiązane tabele
DELETE FROM public.invoice_items;
DELETE FROM public.ocr_comparisons; 
DELETE FROM public.ocr_results;
DELETE FROM public.invoices;

-- Wyczyść storage bucket invoices
DELETE FROM storage.objects WHERE bucket_id = 'invoices';

-- Dodaj funkcję strict walidacji user_id dla faktur
CREATE OR REPLACE FUNCTION public.validate_invoice_user_id_strict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Upewnij się że user_id nie jest null
    IF NEW.user_id IS NULL THEN
        RAISE EXCEPTION 'CRITICAL SECURITY: Invoice user_id cannot be null. Operation rejected.';
    END IF;
    
    -- Sprawdź czy user_id należy do aktualnie zalogowanego użytkownika (jeśli nie service_role)
    IF current_setting('role') != 'service_role' AND NEW.user_id != auth.uid() THEN
        RAISE EXCEPTION 'CRITICAL SECURITY: Invoice user_id % does not match authenticated user %. Operation rejected.', NEW.user_id, auth.uid();
    END IF;
    
    -- Log kritycznej operacji
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (NEW.user_id, 'invoice_created_validated', 'invoices', NEW.id);
    
    RETURN NEW;
END;
$function$;

-- Dodaj trigger walidacji
DROP TRIGGER IF EXISTS validate_invoice_user_id_trigger ON public.invoices;
CREATE TRIGGER validate_invoice_user_id_strict_trigger
    BEFORE INSERT ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_user_id_strict();

-- Funkcja audytu dostępu do danych użytkowników
CREATE OR REPLACE FUNCTION public.audit_user_data_access(p_user_id uuid, p_operation text, p_table_name text, p_details jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (p_user_id, p_operation, p_table_name, gen_random_uuid());
    
    -- Dodatkowe logowanie dla kritycznych operacji
    IF p_operation LIKE '%_SECURITY_%' THEN
        RAISE WARNING 'SECURITY AUDIT: % on % for user %: %', p_operation, p_table_name, p_user_id, p_details;
    END IF;
END;
$function$;

-- Wzmocnij funkcję walidacji połączeń
CREATE OR REPLACE FUNCTION public.validate_connection_ownership_enhanced(p_connection_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    connection_exists boolean := false;
BEGIN
    -- Sprawdź czy połączenie istnieje i należy do użytkownika
    SELECT EXISTS (
        SELECT 1 FROM public.gmail_connections 
        WHERE id = p_connection_id 
        AND user_id = p_user_id 
        AND is_active = true
    ) INTO connection_exists;
    
    -- Zaloguj próbę dostępu
    PERFORM public.audit_user_data_access(
        p_user_id, 
        CASE WHEN connection_exists THEN 'connection_access_granted' ELSE 'connection_access_SECURITY_DENIED' END,
        'gmail_connections',
        jsonb_build_object('connection_id', p_connection_id)
    );
    
    RETURN connection_exists;
END;
$function$;