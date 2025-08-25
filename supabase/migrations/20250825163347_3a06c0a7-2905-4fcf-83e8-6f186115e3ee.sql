-- Finalne naprawy bezpieczeństwa KSeF

-- 1. Sprawdzenie i naprawa funkcji refresh_ksef_stats (brakuje search_path)
CREATE OR REPLACE FUNCTION refresh_ksef_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW ksef_user_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Usunięcie materialized view z API (przeniesienie do prywatnej funkcji)
-- Zamiast udostępniać materialized view przez API, używamy funkcji
DROP MATERIALIZED VIEW IF EXISTS ksef_user_stats;

-- 3. Utworzenie bezpiecznej funkcji zastępującej materialized view
CREATE OR REPLACE FUNCTION get_ksef_user_stats_cached()
RETURNS TABLE (
    user_id UUID,
    total_fetched BIGINT,
    today_fetched BIGINT,
    duplicates_found BIGINT,
    last_fetch TIMESTAMPTZ
) AS $$
BEGIN
    -- Tylko dla zalogowanych użytkowników, tylko ich własne dane
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    RETURN QUERY
    SELECT 
        auth.uid() as user_id,
        COUNT(*) FILTER (WHERE r.status IN ('fetched', 'processed'))::BIGINT as total_fetched,
        COUNT(*) FILTER (WHERE r.status IN ('fetched', 'processed') AND r.first_seen_at::date = CURRENT_DATE)::BIGINT as today_fetched,
        COUNT(*) FILTER (WHERE r.status = 'duplicate')::BIGINT as duplicates_found,
        MAX(r.first_seen_at) as last_fetch
    FROM ksef_invoice_registry r
    WHERE r.user_id = auth.uid()
    GROUP BY r.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Aktualizacja funkcji refresh_ksef_stats aby używać nowej logiki
CREATE OR REPLACE FUNCTION refresh_ksef_stats()
RETURNS void AS $$
BEGIN
    -- Ta funkcja może być używana przez system do czyszczenia cache lub innych operacji
    -- Nie potrzebujemy już materialized view
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Sprawdzenie czy wszystkie funkcje mają prawidłowy search_path
-- Powtórzenie dla pewności wszystkich funkcji KSeF
CREATE OR REPLACE FUNCTION check_ksef_invoice_exists(
    p_user_id UUID,
    p_element_reference_number TEXT,
    p_invoice_hash TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM ksef_invoice_registry 
        WHERE user_id = p_user_id 
        AND (
            ksef_element_reference_number = p_element_reference_number 
            OR invoice_hash = p_invoice_hash
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_ksef_fetch_stats(p_user_id UUID)
RETURNS TABLE (
    total_fetched BIGINT,
    today_fetched BIGINT,
    duplicates_found BIGINT,
    last_fetch TIMESTAMPTZ,
    pending_operations BIGINT,
    avg_processing_time_ms NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM ksef_invoice_registry r WHERE r.user_id = p_user_id AND r.status IN ('fetched', 'processed'))::BIGINT,
        (SELECT COUNT(*) FROM ksef_invoice_registry r WHERE r.user_id = p_user_id AND r.status IN ('fetched', 'processed') AND r.first_seen_at::date = CURRENT_DATE)::BIGINT,
        (SELECT COUNT(*) FROM ksef_invoice_registry r WHERE r.user_id = p_user_id AND r.status = 'duplicate')::BIGINT,
        (SELECT MAX(r.first_seen_at) FROM ksef_invoice_registry r WHERE r.user_id = p_user_id),
        (SELECT COUNT(*) FROM ksef_fetch_operations o WHERE o.user_id = p_user_id AND o.status IN ('pending', 'processing'))::BIGINT,
        (SELECT AVG(o.processing_time_ms) FROM ksef_fetch_operations o WHERE o.user_id = p_user_id AND o.processing_time_ms IS NOT NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_system_ksef_stats()
RETURNS TABLE (
    total_users BIGINT,
    active_configs BIGINT,
    total_operations_24h BIGINT,
    successful_operations_24h BIGINT,
    failed_operations_24h BIGINT,
    total_invoices_24h BIGINT,
    avg_processing_time_ms NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(DISTINCT user_id) FROM ksef_config WHERE is_active = true)::BIGINT,
        (SELECT COUNT(*) FROM ksef_config WHERE is_active = true)::BIGINT,
        (SELECT COUNT(*) FROM ksef_fetch_operations WHERE created_at > NOW() - INTERVAL '24 hours')::BIGINT,
        (SELECT COUNT(*) FROM ksef_fetch_operations WHERE created_at > NOW() - INTERVAL '24 hours' AND status = 'success')::BIGINT,
        (SELECT COUNT(*) FROM ksef_fetch_operations WHERE created_at > NOW() - INTERVAL '24 hours' AND status = 'error')::BIGINT,
        (SELECT COUNT(*) FROM ksef_invoice_registry WHERE first_seen_at > NOW() - INTERVAL '24 hours' AND status IN ('fetched', 'processed'))::BIGINT,
        (SELECT AVG(processing_time_ms) FROM ksef_fetch_operations WHERE created_at > NOW() - INTERVAL '24 hours' AND processing_time_ms IS NOT NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;