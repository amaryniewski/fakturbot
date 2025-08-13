-- Fix security warnings for the cron function

-- Drop and recreate auto_process_gmail_emails function with proper search_path
DROP FUNCTION IF EXISTS auto_process_gmail_emails();

CREATE OR REPLACE FUNCTION auto_process_gmail_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Check if any company has auto_import_emails enabled
    IF EXISTS (
        SELECT 1 FROM public.company_settings 
        WHERE auto_import_emails = true
    ) THEN
        -- Call the Gmail processor edge function
        PERFORM net.http_post(
            url := 'https://qlrfbaantfrqzyrunoau.supabase.co/functions/v1/gmail-processor',
            headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFscmZiYWFudGZycXp5cnVub2F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ2NTY4ODksImV4cCI6MjA3MDIzMjg4OX0.qrJFd0zS7rMtT1ABJjOI-qtWV0lnAE4Q-CoxihwLSb0"}'::jsonb,
            body := '{"fromDate": null, "toDate": null}'::jsonb
        );
    END IF;
END;
$$;