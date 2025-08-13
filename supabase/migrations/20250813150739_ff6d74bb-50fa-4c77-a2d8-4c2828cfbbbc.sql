-- Enable pg_cron extension for scheduled tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a function to trigger automatic Gmail processing
CREATE OR REPLACE FUNCTION auto_process_gmail_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Schedule the function to run every 30 minutes
SELECT cron.schedule(
    'auto-gmail-processing',
    '*/30 * * * *', -- every 30 minutes
    'SELECT auto_process_gmail_emails();'
);