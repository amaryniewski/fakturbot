-- CRITICAL SECURITY FIX: Prevent same Gmail account from being linked to multiple Fakturbot users

-- Add unique constraint to prevent same email from being connected to multiple users
ALTER TABLE public.gmail_connections 
ADD CONSTRAINT unique_email_per_user UNIQUE (email);

-- Update RLS policy to be more strict - users can only see their own connections
DROP POLICY IF EXISTS "Users can view their own connections" ON public.gmail_connections;

CREATE POLICY "Users can only access their own Gmail connections"
ON public.gmail_connections
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add audit logging for Gmail connection creation
CREATE OR REPLACE FUNCTION log_gmail_connection_creation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.security_audit_log (user_id, action, table_name, record_id)
    VALUES (NEW.user_id, 'gmail_connection_created', 'gmail_connections', NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_gmail_connections_creation
    AFTER INSERT ON public.gmail_connections
    FOR EACH ROW
    EXECUTE FUNCTION log_gmail_connection_creation();