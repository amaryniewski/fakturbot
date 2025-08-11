-- Add server and port columns to mailboxes table for IMAP support
ALTER TABLE public.mailboxes 
ADD COLUMN IF NOT EXISTS server text,
ADD COLUMN IF NOT EXISTS port integer DEFAULT 993;