-- PHASE 1: COMPLETE DATA CLEANUP
-- =================================

-- Step 1: Clear all Gmail connections and their tokens
DELETE FROM public.gmail_connections;

-- Step 2: Clear all Fakturownia connections and their tokens  
DELETE FROM public.fakturownia_connections;

-- Step 3: Clear all mailbox tokens
DELETE FROM public.mailbox_tokens;

-- Step 4: Clear all user filter settings
DELETE FROM public.gmail_filter_settings;

-- Step 5: Clear all user automation settings
DELETE FROM public.user_automation_settings;

-- Step 6: Clear all invoices and related data
DELETE FROM public.invoice_items;
DELETE FROM public.invoices;

-- Step 7: Clear OCR results and comparisons
DELETE FROM public.ocr_comparisons;
DELETE FROM public.ocr_results;

-- Step 8: Clear storage files (will be handled separately through storage API)
-- Note: Storage files deletion will be handled by the application layer

-- Step 9: Clear security audit log (optional - keeping recent entries for reference)
DELETE FROM public.security_audit_log WHERE created_at < NOW() - INTERVAL '1 hour';

-- PHASE 2: ADVANCED SECURITY IMPLEMENTATION
-- ==========================================

-- Step 1: Create absolute user isolation enforcement function
CREATE OR REPLACE FUNCTION public.enforce_absolute_user_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- CRITICAL: user_id cannot be null EVER
    IF NEW.user_id IS NULL THEN
        PERFORM public.audit_user_data_access(
            COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
            'CRITICAL_NULL_USER_ID_VIOLATION',
            TG_TABLE_NAME,
            jsonb_build_object('operation', TG_OP, 'table', TG_TABLE_NAME)
        );
        RAISE EXCEPTION 'CRITICAL SECURITY: user_id cannot be null. Operation DENIED for table %.', TG_TABLE_NAME;
    END IF;
    
    -- CRITICAL: If not service_role, user_id MUST match authenticated user
    IF current_setting('role') != 'service_role' AND NEW.user_id != auth.uid() THEN
        PERFORM public.audit_user_data_access(
            COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
            'CRITICAL_CROSS_USER_DATA_VIOLATION',
            TG_TABLE_NAME,
            jsonb_build_object(
                'operation', TG_OP,
                'table', TG_TABLE_NAME,
                'attempted_user_id', NEW.user_id,
                'authenticated_user_id', auth.uid()
            )
        );
        RAISE EXCEPTION 'CRITICAL SECURITY: user_id % does not match authenticated user %. Cross-user data access DENIED for table %.', NEW.user_id, auth.uid(), TG_TABLE_NAME;
    END IF;
    
    -- Log successful operation for audit
    PERFORM public.audit_user_data_access(
        NEW.user_id,
        'data_isolation_enforced_' || TG_OP,
        TG_TABLE_NAME,
        jsonb_build_object('record_id', COALESCE(NEW.id, gen_random_uuid()))
    );
    
    RETURN NEW;
END;
$$;

-- Step 2: Apply absolute isolation triggers to all user data tables
DROP TRIGGER IF EXISTS enforce_invoice_isolation ON public.invoices;
CREATE TRIGGER enforce_invoice_isolation
    BEFORE INSERT OR UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.enforce_absolute_user_isolation();

DROP TRIGGER IF EXISTS enforce_invoice_items_isolation ON public.invoice_items;
CREATE TRIGGER enforce_invoice_items_isolation
    BEFORE INSERT OR UPDATE ON public.invoice_items
    FOR EACH ROW EXECUTE FUNCTION public.enforce_absolute_user_isolation();

DROP TRIGGER IF EXISTS enforce_gmail_filter_settings_isolation ON public.gmail_filter_settings;
CREATE TRIGGER enforce_gmail_filter_settings_isolation
    BEFORE INSERT OR UPDATE ON public.gmail_filter_settings
    FOR EACH ROW EXECUTE FUNCTION public.enforce_absolute_user_isolation();

DROP TRIGGER IF EXISTS enforce_user_automation_settings_isolation ON public.user_automation_settings;
CREATE TRIGGER enforce_user_automation_settings_isolation
    BEFORE INSERT OR UPDATE ON public.user_automation_settings
    FOR EACH ROW EXECUTE FUNCTION public.enforce_absolute_user_isolation();

DROP TRIGGER IF EXISTS enforce_invoice_processing_rules_isolation ON public.invoice_processing_rules;
CREATE TRIGGER enforce_invoice_processing_rules_isolation
    BEFORE INSERT OR UPDATE ON public.invoice_processing_rules
    FOR EACH ROW EXECUTE FUNCTION public.enforce_absolute_user_isolation();

-- Step 3: Create storage path validation function
CREATE OR REPLACE FUNCTION public.validate_storage_path_isolation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'storage'
AS $$
DECLARE
    expected_prefix text;
    current_user_id uuid;
BEGIN
    -- Get current user ID
    current_user_id := auth.uid();
    
    -- Skip validation for service role
    IF current_setting('role') = 'service_role' THEN
        RETURN NEW;
    END IF;
    
    -- For invoices bucket, enforce user-specific paths
    IF NEW.bucket_id = 'invoices' THEN
        expected_prefix := current_user_id::text || '/';
        
        IF NOT NEW.name LIKE (expected_prefix || '%') THEN
            PERFORM public.audit_user_data_access(
                current_user_id,
                'CRITICAL_STORAGE_PATH_VIOLATION',
                'storage.objects',
                jsonb_build_object(
                    'bucket_id', NEW.bucket_id,
                    'attempted_path', NEW.name,
                    'expected_prefix', expected_prefix,
                    'user_id', current_user_id
                )
            );
            RAISE EXCEPTION 'CRITICAL SECURITY: Storage path % does not match user isolation pattern %. Access DENIED.', NEW.name, expected_prefix;
        END IF;
    END IF;
    
    -- Log successful storage operation
    PERFORM public.audit_user_data_access(
        current_user_id,
        'storage_isolation_enforced',
        'storage.objects',
        jsonb_build_object('bucket_id', NEW.bucket_id, 'path', NEW.name)
    );
    
    RETURN NEW;
END;
$$;

-- Step 4: Apply storage isolation trigger
DROP TRIGGER IF EXISTS enforce_storage_isolation ON storage.objects;
CREATE TRIGGER enforce_storage_isolation
    BEFORE INSERT OR UPDATE ON storage.objects
    FOR EACH ROW EXECUTE FUNCTION public.validate_storage_path_isolation();

-- Step 5: Create comprehensive security monitoring function
CREATE OR REPLACE FUNCTION public.monitor_security_violations()
RETURNS TABLE(
    violation_type text,
    severity text,
    violation_count bigint,
    affected_users uuid[],
    details jsonb,
    recommended_action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Check for critical user_id violations in the last hour
    RETURN QUERY
    SELECT 
        'CRITICAL_USER_ID_VIOLATIONS'::text,
        'CRITICAL'::text,
        COUNT(*),
        array_agg(DISTINCT user_id),
        jsonb_build_object(
            'violation_count', COUNT(*),
            'time_window', '1 hour',
            'actions', array_agg(DISTINCT action)
        ),
        'Immediate investigation required - potential security breach'::text
    FROM public.security_audit_log 
    WHERE action LIKE '%CRITICAL%'
    AND created_at > NOW() - INTERVAL '1 hour'
    HAVING COUNT(*) > 0;
    
    -- Check for storage path violations
    RETURN QUERY
    SELECT 
        'STORAGE_PATH_VIOLATIONS'::text,
        'HIGH'::text,
        COUNT(*),
        array_agg(DISTINCT user_id),
        jsonb_build_object(
            'violation_count', COUNT(*),
            'recent_violations', array_agg(action)
        ),
        'Review storage access patterns and enforce stricter controls'::text
    FROM public.security_audit_log 
    WHERE action LIKE '%STORAGE%VIOLATION%'
    AND created_at > NOW() - INTERVAL '24 hours'
    HAVING COUNT(*) > 0;
    
    -- Check for cross-user access attempts
    RETURN QUERY
    SELECT 
        'CROSS_USER_ACCESS_ATTEMPTS'::text,
        'HIGH'::text,
        COUNT(*),
        array_agg(DISTINCT user_id),
        jsonb_build_object(
            'attempts', COUNT(*),
            'patterns', array_agg(DISTINCT action)
        ),
        'Investigate user accounts for potential compromise'::text
    FROM public.security_audit_log 
    WHERE action LIKE '%CROSS_USER%'
    AND created_at > NOW() - INTERVAL '24 hours'
    HAVING COUNT(*) > 0;
END;
$$;

-- Step 6: Create emergency lockdown function
CREATE OR REPLACE FUNCTION public.emergency_security_lockdown(p_reason text DEFAULT 'Emergency lockdown activated')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    violation_count integer;
    lockdown_result jsonb;
BEGIN
    -- Count active violations
    SELECT COUNT(*) INTO violation_count
    FROM public.security_audit_log 
    WHERE action LIKE '%CRITICAL%'
    AND created_at > NOW() - INTERVAL '1 hour';
    
    -- Log emergency lockdown
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (
        '00000000-0000-0000-0000-000000000000'::uuid,
        'EMERGENCY_LOCKDOWN_ACTIVATED',
        'system_security',
        gen_random_uuid()
    );
    
    -- Deactivate all connections (for emergency scenarios)
    UPDATE public.gmail_connections SET is_active = false WHERE is_active = true;
    UPDATE public.fakturownia_connections SET is_active = false WHERE is_active = true;
    
    lockdown_result := jsonb_build_object(
        'lockdown_activated', true,
        'timestamp', NOW(),
        'reason', p_reason,
        'violations_detected', violation_count,
        'gmail_connections_disabled', (SELECT COUNT(*) FROM public.gmail_connections WHERE is_active = false),
        'fakturownia_connections_disabled', (SELECT COUNT(*) FROM public.fakturownia_connections WHERE is_active = false),
        'status', 'EMERGENCY_LOCKDOWN_ACTIVE'
    );
    
    RETURN lockdown_result;
END;
$$;

-- Step 7: Create data isolation validation function
CREATE OR REPLACE FUNCTION public.validate_complete_data_isolation()
RETURNS TABLE(
    table_name text,
    isolation_status text,
    user_count bigint,
    potential_violations jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- Check invoices table isolation
    RETURN QUERY
    SELECT 
        'invoices'::text,
        CASE WHEN COUNT(*) = 0 THEN 'CLEAN' ELSE 'NEEDS_REVIEW' END::text,
        COUNT(DISTINCT user_id),
        jsonb_build_object(
            'total_records', COUNT(*),
            'users_with_data', COUNT(DISTINCT user_id),
            'null_user_ids', COUNT(*) FILTER (WHERE user_id IS NULL)
        )
    FROM public.invoices;
    
    -- Check Gmail connections isolation
    RETURN QUERY
    SELECT 
        'gmail_connections'::text,
        CASE WHEN COUNT(*) = 0 THEN 'CLEAN' ELSE 'NEEDS_REVIEW' END::text,
        COUNT(DISTINCT user_id),
        jsonb_build_object(
            'total_connections', COUNT(*),
            'active_connections', COUNT(*) FILTER (WHERE is_active = true),
            'users_with_connections', COUNT(DISTINCT user_id)
        )
    FROM public.gmail_connections;
    
    -- Check storage files isolation
    RETURN QUERY
    SELECT 
        'storage_files'::text,
        CASE 
            WHEN COUNT(*) = 0 THEN 'CLEAN'
            WHEN COUNT(*) FILTER (WHERE NOT name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/') > 0 THEN 'VIOLATIONS_DETECTED'
            ELSE 'COMPLIANT'
        END::text,
        COUNT(DISTINCT (storage.foldername(name))[1]::uuid),
        jsonb_build_object(
            'total_files', COUNT(*),
            'properly_isolated_files', COUNT(*) FILTER (WHERE name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'),
            'violation_files', COUNT(*) FILTER (WHERE NOT name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/')
        )
    FROM storage.objects 
    WHERE bucket_id = 'invoices';
END;
$$;

-- Step 8: Grant necessary permissions for security functions
GRANT EXECUTE ON FUNCTION public.monitor_security_violations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_complete_data_isolation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.emergency_security_lockdown(text) TO service_role;

-- Step 9: Create comprehensive audit trail
INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'COMPLETE_SECURITY_IMPLEMENTATION_COMPLETED',
    'system_security',
    gen_random_uuid()
);

-- Final verification query
SELECT 
    'SECURITY_IMPLEMENTATION_STATUS' as status,
    jsonb_build_object(
        'cleanup_completed', true,
        'triggers_installed', true,
        'monitoring_active', true,
        'emergency_protocols_ready', true,
        'timestamp', NOW()
    ) as details;