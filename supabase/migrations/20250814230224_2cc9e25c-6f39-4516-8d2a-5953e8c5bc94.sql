-- Add unique constraint for per-user Gmail message deduplication
CREATE UNIQUE INDEX IF NOT EXISTS invoices_user_gmail_msg_uidx
ON public.invoices (user_id, gmail_message_id) 
WHERE gmail_message_id IS NOT NULL;

-- Remove global gmail_message_id constraint if it exists
DROP INDEX IF EXISTS invoices_gmail_message_id_key;

-- Add unique constraint for Gmail connections per user
CREATE UNIQUE INDEX IF NOT EXISTS gmail_connections_user_email_uidx
ON public.gmail_connections (user_id, email)
WHERE is_active = true;

-- Fix gmail_filter_settings column type to proper text array
ALTER TABLE public.gmail_filter_settings
ALTER COLUMN allowed_sender_emails TYPE text[] USING 
  CASE 
    WHEN allowed_sender_emails IS NULL THEN NULL
    ELSE allowed_sender_emails::text[]
  END;