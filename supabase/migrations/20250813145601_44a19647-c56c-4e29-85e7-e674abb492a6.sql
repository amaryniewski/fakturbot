-- CRITICAL SECURITY FIX: Clean up duplicate Gmail connections and prevent future duplicates

-- First, identify and disable duplicate connections (keep the oldest one per email)
UPDATE public.gmail_connections 
SET is_active = false 
WHERE id NOT IN (
    SELECT DISTINCT ON (email) id 
    FROM public.gmail_connections 
    WHERE is_active = true
    ORDER BY email, created_at ASC
);

-- Create partial unique index for active connections only
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_gmail_email 
ON public.gmail_connections (email) 
WHERE is_active = true;

-- Add audit logging for Gmail connection changes
CREATE OR REPLACE FUNCTION log_gmail_connection_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
        VALUES (NEW.user_id, 'gmail_connection_created', 'gmail_connections', NEW.id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
        VALUES (NEW.user_id, 'gmail_connection_updated', 'gmail_connections', NEW.id);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_gmail_connections_changes ON public.gmail_connections;
CREATE TRIGGER audit_gmail_connections_changes
    AFTER INSERT OR UPDATE ON public.gmail_connections
    FOR EACH ROW
    EXECUTE FUNCTION log_gmail_connection_changes();