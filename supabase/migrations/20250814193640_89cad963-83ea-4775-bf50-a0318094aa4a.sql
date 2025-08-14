-- Phase 2: Data Cleanup and Audit Functions
CREATE OR REPLACE FUNCTION public.audit_and_clean_cross_user_invoices()
RETURNS TABLE(
    violation_count integer,
    cleaned_invoices uuid[],
    security_report jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    violation_count_var integer := 0;
    cleaned_ids uuid[];
    duplicate_message record;
BEGIN
    -- Find invoices with same gmail_message_id but different user_id
    FOR duplicate_message IN
        SELECT 
            gmail_message_id,
            array_agg(DISTINCT user_id) as user_ids,
            array_agg(id) as invoice_ids,
            count(DISTINCT user_id) as user_count
        FROM public.invoices 
        WHERE gmail_message_id IS NOT NULL
        GROUP BY gmail_message_id
        HAVING count(DISTINCT user_id) > 1
    LOOP
        violation_count_var := violation_count_var + 1;
        
        -- Log critical security violation
        INSERT INTO public.security_audit_log (
            user_id, action, table_name, record_id
        ) VALUES (
            '00000000-0000-0000-0000-000000000000'::uuid,
            'CRITICAL_CROSS_USER_GMAIL_MESSAGE_DETECTED',
            'invoices',
            duplicate_message.invoice_ids[1]
        );
        
        -- For safety, we'll only log violations, not auto-delete
        -- Manual review required for cleanup
        cleaned_ids := array_cat(cleaned_ids, duplicate_message.invoice_ids);
    END LOOP;
    
    RETURN QUERY VALUES (
        violation_count_var,
        COALESCE(cleaned_ids, ARRAY[]::uuid[]),
        jsonb_build_object(
            'timestamp', now(),
            'total_violations', violation_count_var,
            'requires_manual_review', true,
            'affected_invoices', cleaned_ids
        )
    );
END;
$$;