-- ETAP 1: Schemat bazy danych KSeF
-- Implementacja kompletnego schematu dla integracji z KSeF

-- 1. Utworzenie tabeli parsed_data jeśli nie istnieje
CREATE TABLE IF NOT EXISTS parsed_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    invoice_number TEXT,
    seller_name TEXT,
    buyer_name TEXT,
    total_amount DECIMAL(15,2),
    currency TEXT DEFAULT 'PLN',
    issue_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS dla parsed_data
ALTER TABLE parsed_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can manage their own parsed data" ON parsed_data
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Service role can manage all parsed data" ON parsed_data
    FOR ALL USING (auth.role() = 'service_role');

-- 2. Tabela konfiguracji KSeF
CREATE TABLE IF NOT EXISTS ksef_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
    nip TEXT NOT NULL CHECK (LENGTH(nip) = 10 AND nip ~ '^[0-9]+$'),
    token_encrypted TEXT NOT NULL,
    auto_fetch BOOLEAN NOT NULL DEFAULT true,
    fetch_interval_minutes INTEGER NOT NULL DEFAULT 30 CHECK (fetch_interval_minutes IN (15, 30, 60, 120, 240, 480, 720, 1440)),
    last_fetch_timestamp TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial UNIQUE index dla aktywnych konfiguracji
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_config_per_user 
ON ksef_config(user_id) WHERE is_active = true;

-- Indeksy dla ksef_config
CREATE INDEX IF NOT EXISTS idx_ksef_config_user_id ON ksef_config(user_id);
CREATE INDEX IF NOT EXISTS idx_ksef_config_active ON ksef_config(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ksef_config_auto_fetch ON ksef_config(auto_fetch, last_fetch_timestamp) WHERE auto_fetch = true;

-- RLS dla ksef_config
ALTER TABLE ksef_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own KSeF config" ON ksef_config
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all KSeF configs" ON ksef_config
    FOR ALL USING (auth.role() = 'service_role');

-- 3. Tabela operacji pobierania
CREATE TABLE IF NOT EXISTS ksef_fetch_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN (
        'session_init', 'query_start', 'query_status', 'query_result', 'invoice_fetch'
    )),
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error', 'processing', 'timeout')),
    session_id TEXT,
    query_id TEXT,
    invoices_found INTEGER NOT NULL DEFAULT 0,
    invoices_processed INTEGER NOT NULL DEFAULT 0,
    invoices_new INTEGER NOT NULL DEFAULT 0,
    packages_count INTEGER NOT NULL DEFAULT 0,
    duplicates_found INTEGER NOT NULL DEFAULT 0,
    error_code TEXT,
    error_message TEXT,
    request_data JSONB,
    response_data JSONB,
    processing_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indeksy dla ksef_fetch_operations
CREATE INDEX IF NOT EXISTS idx_ksef_operations_user_id ON ksef_fetch_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_ksef_operations_status ON ksef_fetch_operations(status);
CREATE INDEX IF NOT EXISTS idx_ksef_operations_created_at ON ksef_fetch_operations(created_at);
CREATE INDEX IF NOT EXISTS idx_ksef_operations_user_status_date ON ksef_fetch_operations(user_id, status, created_at DESC);

-- RLS dla ksef_fetch_operations
ALTER TABLE ksef_fetch_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own operations" ON ksef_fetch_operations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all operations" ON ksef_fetch_operations
    FOR ALL USING (auth.role() = 'service_role');

-- 4. Tabela rejestru faktur KSeF
CREATE TABLE IF NOT EXISTS ksef_invoice_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    ksef_element_reference_number TEXT NOT NULL,
    ksef_invoice_number TEXT NOT NULL,
    invoice_hash TEXT NOT NULL,
    issue_date DATE NOT NULL,
    seller_nip TEXT NOT NULL,
    buyer_nip TEXT,
    total_amount DECIMAL(15,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PLN',
    status TEXT NOT NULL CHECK (status IN ('fetched', 'processed', 'error', 'duplicate')),
    parsed_data_id UUID,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- UNIQUE constraints dla wykrywania duplikatów
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_element_ref 
ON ksef_invoice_registry(user_id, ksef_element_reference_number);

CREATE UNIQUE INDEX IF NOT EXISTS unique_user_hash 
ON ksef_invoice_registry(user_id, invoice_hash);

-- Indeksy dla ksef_invoice_registry
CREATE INDEX IF NOT EXISTS idx_ksef_registry_user_id ON ksef_invoice_registry(user_id);
CREATE INDEX IF NOT EXISTS idx_ksef_registry_hash ON ksef_invoice_registry(invoice_hash);
CREATE INDEX IF NOT EXISTS idx_ksef_registry_element_ref ON ksef_invoice_registry(ksef_element_reference_number);
CREATE INDEX IF NOT EXISTS idx_ksef_registry_user_date ON ksef_invoice_registry(user_id, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_ksef_registry_status ON ksef_invoice_registry(status);

-- RLS dla ksef_invoice_registry
ALTER TABLE ksef_invoice_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invoice registry" ON ksef_invoice_registry
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all invoice registry" ON ksef_invoice_registry
    FOR ALL USING (auth.role() = 'service_role');

-- 5. Rozszerzenie tabeli parsed_data o kolumny KSeF
ALTER TABLE parsed_data 
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual', 'email', 'ksef', 'api')),
ADD COLUMN IF NOT EXISTS ksef_element_reference_number TEXT,
ADD COLUMN IF NOT EXISTS ksef_original_xml TEXT,
ADD COLUMN IF NOT EXISTS ksef_fetch_date TIMESTAMPTZ;

-- Indeksy dla nowych kolumn
CREATE INDEX IF NOT EXISTS idx_parsed_data_source_type ON parsed_data(source_type);
CREATE INDEX IF NOT EXISTS idx_parsed_data_ksef_element_ref ON parsed_data(ksef_element_reference_number) WHERE ksef_element_reference_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parsed_data_ksef_fetch_date ON parsed_data(ksef_fetch_date) WHERE ksef_fetch_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parsed_data_ksef_composite ON parsed_data(user_id, source_type, created_at DESC) WHERE source_type = 'ksef';

-- Aktualizacja istniejących rekordów
UPDATE parsed_data SET source_type = 'manual' WHERE source_type IS NULL;

-- 6. Funkcje pomocnicze
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

-- 7. Tabela logów błędów
CREATE TABLE IF NOT EXISTS ksef_error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    operation_id UUID,
    error_type TEXT NOT NULL,
    error_code TEXT,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    context_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indeksy dla ksef_error_logs
CREATE INDEX IF NOT EXISTS idx_ksef_error_logs_user_id ON ksef_error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ksef_error_logs_error_type ON ksef_error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_ksef_error_logs_created_at ON ksef_error_logs(created_at);

-- RLS dla ksef_error_logs
ALTER TABLE ksef_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own error logs" ON ksef_error_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can manage error logs" ON ksef_error_logs
    FOR ALL USING (auth.role() = 'service_role');

-- 8. Widok do monitorowania automatycznego pobierania
CREATE OR REPLACE VIEW ksef_auto_fetch_status AS
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

-- 9. Widok zmaterializowany dla szybkich statystyk
CREATE MATERIALIZED VIEW IF NOT EXISTS ksef_user_stats AS
SELECT 
    user_id,
    COUNT(*) FILTER (WHERE status IN ('fetched', 'processed')) as total_fetched,
    COUNT(*) FILTER (WHERE status IN ('fetched', 'processed') AND first_seen_at::date = CURRENT_DATE) as today_fetched,
    COUNT(*) FILTER (WHERE status = 'duplicate') as duplicates_found,
    MAX(first_seen_at) as last_fetch
FROM ksef_invoice_registry
GROUP BY user_id;

-- Indeks na widoku zmaterializowanym
CREATE UNIQUE INDEX IF NOT EXISTS idx_ksef_user_stats_user_id ON ksef_user_stats(user_id);

-- RLS dla widoku zmaterializowanego
ALTER MATERIALIZED VIEW ksef_user_stats SET (security_barrier = true);

-- Funkcja odświeżania widoku
CREATE OR REPLACE FUNCTION refresh_ksef_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW ksef_user_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 10. Triggery dla updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggery dla wszystkich tabel z updated_at
DROP TRIGGER IF EXISTS update_parsed_data_updated_at ON parsed_data;
CREATE TRIGGER update_parsed_data_updated_at
    BEFORE UPDATE ON parsed_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ksef_config_updated_at ON ksef_config;
CREATE TRIGGER update_ksef_config_updated_at
    BEFORE UPDATE ON ksef_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ksef_operations_updated_at ON ksef_fetch_operations;
CREATE TRIGGER update_ksef_operations_updated_at
    BEFORE UPDATE ON ksef_fetch_operations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger dla last_updated_at w ksef_invoice_registry
CREATE OR REPLACE FUNCTION update_last_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ksef_registry_last_updated_at ON ksef_invoice_registry;
CREATE TRIGGER update_ksef_registry_last_updated_at
    BEFORE UPDATE ON ksef_invoice_registry
    FOR EACH ROW
    EXECUTE FUNCTION update_last_updated_at_column();