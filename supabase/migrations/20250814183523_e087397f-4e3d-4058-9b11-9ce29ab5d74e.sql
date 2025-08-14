-- Faza 3: Wzmocnij funkcje bazodanowe i Faza 4: Zabezpiecz storage

-- Dodaj RLS dla storage bucket invoices - pliki w folderach per user_id
CREATE POLICY "Users can upload to their own folder" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view files in their own folder" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update files in their own folder" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete files in their own folder" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Funkcja walidacji ścieżek plików przed operacjami storage
CREATE OR REPLACE FUNCTION public.validate_file_path_security(p_user_id uuid, p_file_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Sprawdź czy ścieżka zaczyna się od user_id
    IF NOT p_file_path LIKE (p_user_id::text || '/%') THEN
        PERFORM public.audit_user_data_access(
            p_user_id,
            'file_path_SECURITY_VIOLATION',
            'storage.objects',
            jsonb_build_object('attempted_path', p_file_path, 'expected_prefix', p_user_id::text)
        );
        RETURN false;
    END IF;
    
    RETURN true;
END;
$function$;

-- Wzmocniona funkcja walidacji właściciela faktury z dodatkowymi sprawdzeniami
CREATE OR REPLACE FUNCTION public.validate_invoice_ownership_enhanced(p_invoice_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    invoice_exists boolean := false;
    invoice_user_id uuid;
BEGIN
    -- Sprawdź czy faktura istnieje i pobierz jej user_id
    SELECT user_id INTO invoice_user_id
    FROM public.invoices 
    WHERE id = p_invoice_id;
    
    IF invoice_user_id IS NULL THEN
        -- Faktura nie istnieje
        PERFORM public.audit_user_data_access(
            p_user_id,
            'invoice_SECURITY_NOT_FOUND',
            'invoices',
            jsonb_build_object('invoice_id', p_invoice_id, 'attempted_by', p_user_id)
        );
        RETURN false;
    END IF;
    
    IF invoice_user_id != p_user_id THEN
        -- Faktura należy do innego użytkownika - CRITICAL SECURITY VIOLATION
        PERFORM public.audit_user_data_access(
            p_user_id,
            'invoice_SECURITY_CROSS_USER_ACCESS_DENIED',
            'invoices',
            jsonb_build_object(
                'invoice_id', p_invoice_id, 
                'invoice_owner', invoice_user_id,
                'attempted_by', p_user_id
            )
        );
        RETURN false;
    END IF;
    
    -- Access granted - log success
    PERFORM public.audit_user_data_access(
        p_user_id,
        'invoice_access_granted',
        'invoices',
        jsonb_build_object('invoice_id', p_invoice_id)
    );
    
    RETURN true;
END;
$function$;

-- Funkcja monitoringu rozdziału danych między użytkownikami
CREATE OR REPLACE FUNCTION public.get_user_data_isolation_report()
RETURNS TABLE(
    user_id uuid,
    invoice_count bigint,
    gmail_connections_count bigint,
    fakturownia_connections_count bigint,
    storage_files_count bigint,
    potential_security_issues jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH user_stats AS (
        -- Policz faktury per user
        SELECT 
            i.user_id,
            COUNT(i.id) as invoice_count
        FROM public.invoices i
        GROUP BY i.user_id
        
        UNION ALL
        
        -- Dodaj użytkowników bez faktur
        SELECT 
            gc.user_id,
            0 as invoice_count
        FROM public.gmail_connections gc
        WHERE gc.user_id NOT IN (SELECT DISTINCT user_id FROM public.invoices)
        GROUP BY gc.user_id
    ),
    gmail_stats AS (
        SELECT 
            gc.user_id,
            COUNT(gc.id) as gmail_count
        FROM public.gmail_connections gc
        WHERE gc.is_active = true
        GROUP BY gc.user_id
    ),
    fakturownia_stats AS (
        SELECT 
            fc.user_id,
            COUNT(fc.id) as fakturownia_count
        FROM public.fakturownia_connections fc
        WHERE fc.is_active = true
        GROUP BY fc.user_id
    ),
    storage_stats AS (
        SELECT 
            (storage.foldername(so.name))[1]::uuid as user_id,
            COUNT(*) as storage_count
        FROM storage.objects so
        WHERE so.bucket_id = 'invoices'
        GROUP BY (storage.foldername(so.name))[1]::uuid
    )
    SELECT 
        COALESCE(us.user_id, gs.user_id, fs.user_id, ss.user_id) as user_id,
        COALESCE(SUM(us.invoice_count), 0) as invoice_count,
        COALESCE(gs.gmail_count, 0) as gmail_connections_count,
        COALESCE(fs.fakturownia_count, 0) as fakturownia_connections_count,
        COALESCE(ss.storage_count, 0) as storage_files_count,
        -- Sprawdź potencjalne problemy bezpieczeństwa
        jsonb_build_object(
            'has_invoices_without_connections', (COALESCE(SUM(us.invoice_count), 0) > 0 AND COALESCE(gs.gmail_count, 0) = 0),
            'has_files_without_invoices', (COALESCE(ss.storage_count, 0) > COALESCE(SUM(us.invoice_count), 0)),
            'missing_file_isolation', EXISTS(
                SELECT 1 FROM storage.objects so2
                WHERE so2.bucket_id = 'invoices' 
                AND NOT so2.name LIKE (COALESCE(us.user_id, gs.user_id, fs.user_id, ss.user_id)::text || '/%')
            )
        ) as potential_security_issues
    FROM user_stats us
    FULL OUTER JOIN gmail_stats gs ON us.user_id = gs.user_id
    FULL OUTER JOIN fakturownia_stats fs ON COALESCE(us.user_id, gs.user_id) = fs.user_id
    FULL OUTER JOIN storage_stats ss ON COALESCE(us.user_id, gs.user_id, fs.user_id) = ss.user_id
    GROUP BY us.user_id, gs.user_id, fs.user_id, ss.user_id, gs.gmail_count, fs.fakturownia_count, ss.storage_count;
END;
$function$;

-- Funkcja alertów bezpieczeństwa
CREATE OR REPLACE FUNCTION public.check_data_isolation_violations()
RETURNS TABLE(
    violation_type text,
    severity text,
    affected_users uuid[],
    details jsonb,
    recommended_action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Sprawdź faktury bez poprawnego user_id
    RETURN QUERY
    SELECT 
        'ORPHANED_INVOICES'::text as violation_type,
        'CRITICAL'::text as severity,
        ARRAY[NULL::uuid] as affected_users,
        jsonb_build_object(
            'count', COUNT(*),
            'invoice_ids', array_agg(id)
        ) as details,
        'Delete orphaned invoices immediately'::text as recommended_action
    FROM public.invoices 
    WHERE user_id IS NULL
    HAVING COUNT(*) > 0;
    
    -- Sprawdź pliki storage bez poprawnej struktury folderów
    RETURN QUERY
    SELECT 
        'STORAGE_PATH_VIOLATIONS'::text as violation_type,
        'HIGH'::text as severity,
        ARRAY[NULL::uuid] as affected_users,
        jsonb_build_object(
            'count', COUNT(*),
            'file_paths', array_agg(name)
        ) as details,
        'Move files to user-specific folders or delete'::text as recommended_action
    FROM storage.objects 
    WHERE bucket_id = 'invoices' 
    AND NOT name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    HAVING COUNT(*) > 0;
    
    -- Sprawdź użytkowników z podejrzaną aktywnością
    RETURN QUERY
    SELECT 
        'SUSPICIOUS_CROSS_USER_ACCESS'::text as violation_type,
        'HIGH'::text as severity,
        array_agg(DISTINCT user_id) as affected_users,
        jsonb_build_object(
            'violation_count', COUNT(*),
            'recent_violations', array_agg(action)
        ) as details,
        'Investigate user accounts and restrict access if needed'::text as recommended_action
    FROM public.security_audit_log 
    WHERE action LIKE '%_SECURITY_%'
    AND created_at > NOW() - INTERVAL '24 hours'
    GROUP BY date_trunc('hour', created_at)
    HAVING COUNT(*) > 5;
    
END;
$function$;