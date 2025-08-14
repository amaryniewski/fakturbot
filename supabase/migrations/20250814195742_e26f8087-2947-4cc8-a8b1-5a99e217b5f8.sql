-- KROK 8: Tymczasowe wyłączenie triggerów, naprawa danych, włączenie z powrotem

-- Tymczasowo wyłącz triggery security
DROP TRIGGER IF EXISTS strict_user_validation_trigger ON public.invoices;
DROP TRIGGER IF EXISTS validate_gmail_owner_trigger ON public.invoices;

-- Napraw błędnie przypisane faktury
UPDATE public.invoices 
SET user_id = 'e2f9fdab-73e4-4e7c-86c3-37d26d4823be'::uuid,
    updated_at = now()
WHERE gmail_message_id IN ('198838bf2be333d5', '198a25cc37f07532', '198a2611a58d30a9')
AND user_id = '6b5441a5-7ad9-4a94-beb2-61def4ff1fd5'::uuid;

-- Zaktualizuj URLs plików storage aby wskazywały na poprawne ścieżki
UPDATE public.invoices 
SET file_url = replace(file_url, 
    '6b5441a5-7ad9-4a94-beb2-61def4ff1fd5/', 
    'e2f9fdab-73e4-4e7c-86c3-37d26d4823be/'),
    updated_at = now()
WHERE user_id = 'e2f9fdab-73e4-4e7c-86c3-37d26d4823be'::uuid
AND file_url LIKE '%6b5441a5-7ad9-4a94-beb2-61def4ff1fd5%';

-- Log corrective actions
INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
VALUES 
('e2f9fdab-73e4-4e7c-86c3-37d26d4823be'::uuid, 'CORRECTIVE_ACTION_INVOICE_OWNER_FIXED', 'invoices', gen_random_uuid()),
('6b5441a5-7ad9-4a94-beb2-61def4ff1fd5'::uuid, 'CORRECTIVE_ACTION_INVOICE_MOVED_AWAY', 'invoices', gen_random_uuid()),
('00000000-0000-0000-0000-000000000000'::uuid, 'SYSTEM_DATA_ISOLATION_REPAIR_COMPLETED', 'invoices', gen_random_uuid());

-- PRZYWRÓĆ TRIGGERY - CRITICAL dla bezpieczeństwa przyszłych operacji
CREATE TRIGGER strict_user_validation_trigger
    BEFORE INSERT ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.strict_user_validation_before_insert();

CREATE TRIGGER validate_gmail_owner_trigger
    BEFORE INSERT ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_gmail_message_owner_before_insert();