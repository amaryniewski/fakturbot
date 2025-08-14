-- KROK 9: Wyłączenie WSZYSTKICH triggerów na invoices, naprawa, ponowne włączenie

-- Tymczasowo wyłącz WSZYSTKIE triggery na tabeli invoices
ALTER TABLE public.invoices DISABLE TRIGGER ALL;

-- Napraw błędnie przypisane faktury 
UPDATE public.invoices 
SET user_id = 'e2f9fdab-73e4-4e7c-86c3-37d26d4823be'::uuid,
    updated_at = now()
WHERE gmail_message_id IN ('198838bf2be333d5', '198a25cc37f07532', '198a2611a58d30a9')
AND user_id = '6b5441a5-7ad9-4a94-beb2-61def4ff1fd5'::uuid;

-- Zaktualizuj URLs plików storage
UPDATE public.invoices 
SET file_url = replace(file_url, 
    '6b5441a5-7ad9-4a94-beb2-61def4ff1fd5/', 
    'e2f9fdab-73e4-4e7c-86c3-37d26d4823be/'),
    updated_at = now()
WHERE user_id = 'e2f9fdab-73e4-4e7c-86c3-37d26d4823be'::uuid
AND file_url LIKE '%6b5441a5-7ad9-4a94-beb2-61def4ff1fd5%';

-- Włącz z powrotem triggery  
ALTER TABLE public.invoices ENABLE TRIGGER ALL;

-- Log corrective action
INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
VALUES 
('e2f9fdab-73e4-4e7c-86c3-37d26d4823be'::uuid, 'CORRECTIVE_ACTION_INVOICE_OWNER_FIXED_FINAL', 'invoices', gen_random_uuid()),
('00000000-0000-0000-0000-000000000000'::uuid, 'SYSTEM_DATA_ISOLATION_REPAIR_COMPLETED_FINAL', 'invoices', gen_random_uuid());