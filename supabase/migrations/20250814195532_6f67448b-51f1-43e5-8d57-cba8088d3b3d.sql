-- KROK 1: Funkcja weryfikacji bezpieczeństwa przed każdą operacją
CREATE OR REPLACE FUNCTION public.strict_user_validation_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- CRITICAL: user_id nie może być null
    IF NEW.user_id IS NULL THEN
        RAISE EXCEPTION 'CRITICAL SECURITY: user_id cannot be null in table %. Operation DENIED.', TG_TABLE_NAME;
    END IF;
    
    -- CRITICAL: Jeśli to nie service_role, user_id MUSI być auth.uid()
    IF current_setting('role') != 'service_role' AND NEW.user_id != auth.uid() THEN
        RAISE EXCEPTION 'CRITICAL SECURITY: Attempted to insert % with user_id % but authenticated user is %. Cross-user violation DENIED.', TG_TABLE_NAME, NEW.user_id, auth.uid();
    END IF;
    
    -- Loguj każdą operację ze szczegółami
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (NEW.user_id, 'strict_validation_passed_' || TG_TABLE_NAME, TG_TABLE_NAME, COALESCE(NEW.id, gen_random_uuid()));
    
    RETURN NEW;
END;
$function$;

-- KROK 2: Funkcja sprawdzenia właściciela Gmail message przed wstawieniem
CREATE OR REPLACE FUNCTION public.validate_gmail_message_owner_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    existing_owner_id uuid;
    correct_owner_id uuid;
BEGIN
    -- Sprawdź czy gmail_message_id już istnieje dla innego użytkownika
    IF NEW.gmail_message_id IS NOT NULL THEN
        SELECT user_id INTO existing_owner_id
        FROM public.invoices 
        WHERE gmail_message_id = NEW.gmail_message_id
        AND user_id != NEW.user_id
        LIMIT 1;
        
        IF existing_owner_id IS NOT NULL THEN
            -- Log critical security violation
            INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
            VALUES (NEW.user_id, 'CRITICAL_GMAIL_MESSAGE_OWNER_CONFLICT', 'invoices', NEW.id);
            
            RAISE EXCEPTION 'CRITICAL SECURITY: Gmail message % already exists for user %. Attempted by user %. Operation DENIED.', 
                NEW.gmail_message_id, existing_owner_id, NEW.user_id;
        END IF;
        
        -- Sprawdź czy NEW.user_id ma połączenie Gmail, które mogło odebrać tę wiadomość
        IF NOT EXISTS (
            SELECT 1 FROM public.gmail_connections gc 
            WHERE gc.user_id = NEW.user_id 
            AND gc.is_active = true
        ) THEN
            INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
            VALUES (NEW.user_id, 'CRITICAL_NO_GMAIL_CONNECTION_FOR_MESSAGE', 'invoices', NEW.id);
            
            RAISE EXCEPTION 'CRITICAL SECURITY: User % has no active Gmail connections but trying to create invoice with gmail_message_id %. Operation DENIED.',
                NEW.user_id, NEW.gmail_message_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$;

-- KROK 3: Trigger na tabeli invoices - ścisła walidacja
DROP TRIGGER IF EXISTS strict_user_validation_trigger ON public.invoices;
CREATE TRIGGER strict_user_validation_trigger
    BEFORE INSERT ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.strict_user_validation_before_insert();

-- KROK 4: Trigger na tabeli invoices - walidacja właściciela Gmail message
DROP TRIGGER IF EXISTS validate_gmail_owner_trigger ON public.invoices;
CREATE TRIGGER validate_gmail_owner_trigger
    BEFORE INSERT ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_gmail_message_owner_before_insert();

-- KROK 5: Funkcja do audytu i naprawy cross-user invoices
CREATE OR REPLACE FUNCTION public.audit_and_fix_cross_user_invoices()
RETURNS TABLE(
    action_type text,
    invoice_id uuid,
    wrong_user_id uuid,
    correct_user_id uuid,
    gmail_message_id text,
    file_path_old text,
    file_path_new text,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    invoice_record record;
    correct_user uuid;
    old_path text;
    new_path text;
BEGIN
    -- Znajdź faktury, które mogą być przypisane do złego użytkownika
    FOR invoice_record IN
        SELECT 
            i.id,
            i.user_id,
            i.gmail_message_id,
            i.file_url,
            i.file_name,
            i.sender_email
        FROM public.invoices i
        WHERE i.created_at > NOW() - INTERVAL '24 hours'
        AND i.gmail_message_id IS NOT NULL
    LOOP
        -- Sprawdź czy istnieje połączenie Gmail dla tego sender_email dla innego użytkownika
        SELECT gc.user_id INTO correct_user
        FROM public.gmail_connections gc
        WHERE gc.is_active = true
        AND gc.email = invoice_record.sender_email;
        
        -- Jeśli nie znaleziono bezpośredniego połączenia, sprawdź czy wiadomość mogła być otrzymana przez inne konto
        IF correct_user IS NULL THEN
            -- Sprawdź wszystkie aktywne połączenia Gmail
            FOR correct_user IN
                SELECT DISTINCT gc.user_id
                FROM public.gmail_connections gc
                WHERE gc.is_active = true
                AND gc.user_id != invoice_record.user_id
            LOOP
                -- Zwróć informację o potencjalnej niezgodności
                RETURN QUERY VALUES (
                    'POTENTIAL_MISMATCH'::text,
                    invoice_record.id,
                    invoice_record.user_id,
                    correct_user,
                    invoice_record.gmail_message_id,
                    invoice_record.file_url,
                    NULL::text,
                    'REQUIRES_MANUAL_REVIEW'::text
                );
            END LOOP;
        ELSE
            -- Jeśli znaleziono poprawnego właściciela i to nie jest aktualny user_id
            IF correct_user != invoice_record.user_id THEN
                RETURN QUERY VALUES (
                    'INCORRECT_OWNER_DETECTED'::text,
                    invoice_record.id,
                    invoice_record.user_id,
                    correct_user,
                    invoice_record.gmail_message_id,
                    invoice_record.file_url,
                    NULL::text,
                    'CRITICAL_SECURITY_VIOLATION'::text
                );
                
                -- Log critical security incident
                INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
                VALUES (
                    correct_user,
                    'AUDIT_DETECTED_INCORRECT_INVOICE_OWNER',
                    'invoices',
                    invoice_record.id
                );
            END IF;
        END IF;
    END LOOP;
END;
$function$;