-- KROK 6: Naprawa niepoprawnie przypisanych faktur
-- Te faktury zostały błędnie przypisane do user_id 6b5441a5-7ad9-4a94-beb2-61def4ff1fd5 
-- ale powinny być przypisane do e2f9fdab-73e4-4e7c-86c3-37d26d4823be (amaryniewskiconsulting@gmail.com)

UPDATE public.invoices 
SET user_id = 'e2f9fdab-73e4-4e7c-86c3-37d26d4823be'::uuid,
    updated_at = now()
WHERE gmail_message_id IN ('198838bf2be333d5', '198a25cc37f07532', '198a2611a58d30a9')
AND user_id = '6b5441a5-7ad9-4a94-beb2-61def4ff1fd5'::uuid;

-- Log corrective action for audit
INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
VALUES 
('e2f9fdab-73e4-4e7c-86c3-37d26d4823be'::uuid, 'CORRECTIVE_ACTION_INVOICE_OWNER_FIXED', 'invoices', gen_random_uuid()),
('6b5441a5-7ad9-4a94-beb2-61def4ff1fd5'::uuid, 'CORRECTIVE_ACTION_INVOICE_MOVED_AWAY', 'invoices', gen_random_uuid());

-- KROK 7: Funkcja do transferu plików storage między użytkownikami
CREATE OR REPLACE FUNCTION public.transfer_storage_files_to_correct_user()
RETURNS TABLE(
    file_name text,
    old_path text,
    new_path text,
    transfer_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    file_record record;
    source_path text;
    target_path text;
BEGIN
    -- Znajdź pliki storage które mogą być przypisane do złego użytkownika
    FOR file_record IN
        SELECT 
            i.file_name,
            i.file_url,
            i.user_id,
            i.id as invoice_id
        FROM public.invoices i
        WHERE i.user_id = 'e2f9fdab-73e4-4e7c-86c3-37d26d4823be'::uuid
        AND i.file_url LIKE '%6b5441a5-7ad9-4a94-beb2-61def4ff1fd5%'
        AND i.created_at > NOW() - INTERVAL '24 hours'
    LOOP
        -- Extract old and new paths
        source_path := replace(file_record.file_url, 
            'https://qlrfbaantfrqzyrunoau.supabase.co/storage/v1/object/public/invoices/', '');
        target_path := replace(source_path, 
            '6b5441a5-7ad9-4a94-beb2-61def4ff1fd5/', 
            'e2f9fdab-73e4-4e7c-86c3-37d26d4823be/');
        
        -- Return information about files that need to be moved
        RETURN QUERY VALUES (
            file_record.file_name,
            source_path,
            target_path,
            'NEEDS_MANUAL_MOVE'::text
        );
        
        -- Log the file transfer requirement
        INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
        VALUES (
            file_record.user_id,
            'FILE_TRANSFER_REQUIRED',
            'storage.objects',
            file_record.invoice_id
        );
    END LOOP;
END;
$function$;