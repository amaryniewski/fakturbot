-- Naprawianie ostrzeżeń bezpieczeństwa KSeF - poprawiona wersja

-- 1. Naprawa funkcji bez search_path (warnings 2-4)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_last_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Ponowne utworzenie widoku ksef_auto_fetch_status bez security definer
DROP VIEW IF EXISTS ksef_auto_fetch_status;

CREATE VIEW ksef_auto_fetch_status AS
SELECT 
    c.user_id,
    c.nip,
    c.environment,
    c.auto_fetch,
    c.fetch_interval_minutes,
    c.last_fetch_timestamp,
    CASE 
        WHEN c.last_fetch_timestamp IS NULL THEN 'Nigdy nie pobierano'
        WHEN NOW() - c.last_fetch_timestamp > INTERVAL '1 hour' * c.fetch_interval_minutes / 60 * 2 THEN 'Opóźnienie'
        ELSE 'Aktywne'
    END as status,
    (
        SELECT COUNT(*) 
        FROM ksef_fetch_operations o 
        WHERE o.user_id = c.user_id 
        AND o.created_at > NOW() - INTERVAL '24 hours'
        AND o.status = 'success'
    ) as successful_fetches_24h,
    (
        SELECT COUNT(*) 
        FROM ksef_invoice_registry r 
        WHERE r.user_id = c.user_id 
        AND r.first_seen_at > NOW() - INTERVAL '24 hours'
        AND r.status IN ('fetched', 'processed')
    ) as new_invoices_24h
FROM ksef_config c
WHERE c.is_active = true AND c.user_id = auth.uid();

-- 3. Bezpieczna funkcja dostępu do statystyk użytkownika
CREATE OR REPLACE FUNCTION get_user_ksef_stats_safe(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    user_id UUID,
    total_fetched BIGINT,
    today_fetched BIGINT,
    duplicates_found BIGINT,
    last_fetch TIMESTAMPTZ
) AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Użyj podanego user_id lub aktualnie zalogowanego użytkownika
    target_user_id := COALESCE(p_user_id, auth.uid());
    
    -- Sprawdź czy użytkownik może dostać swoje własne dane
    IF target_user_id != auth.uid() AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        r.user_id,
        COUNT(*) FILTER (WHERE r.status IN ('fetched', 'processed'))::BIGINT as total_fetched,
        COUNT(*) FILTER (WHERE r.status IN ('fetched', 'processed') AND r.first_seen_at::date = CURRENT_DATE)::BIGINT as today_fetched,
        COUNT(*) FILTER (WHERE r.status = 'duplicate')::BIGINT as duplicates_found,
        MAX(r.first_seen_at) as last_fetch
    FROM ksef_invoice_registry r
    WHERE r.user_id = target_user_id
    GROUP BY r.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;