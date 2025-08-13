-- Remove company-based automation settings and create simple user-based settings

-- Create a simple user automation settings table
CREATE TABLE IF NOT EXISTS public.user_automation_settings (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    auto_import_emails boolean NOT NULL DEFAULT false,
    auto_send_to_ocr boolean NOT NULL DEFAULT false,
    auto_send_to_accounting boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_automation_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own automation settings" 
ON public.user_automation_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own automation settings" 
ON public.user_automation_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own automation settings" 
ON public.user_automation_settings 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_user_automation_settings_updated_at
BEFORE UPDATE ON public.user_automation_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update the auto processing function to use user settings instead of company settings
DROP FUNCTION IF EXISTS auto_process_gmail_emails();

CREATE OR REPLACE FUNCTION auto_process_gmail_emails()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Check if any user has auto_import_emails enabled
    IF EXISTS (
        SELECT 1 FROM public.user_automation_settings 
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