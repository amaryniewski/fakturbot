-- Fix company_settings access issues

-- First, let's create a default company and membership for testing
-- Insert a default company if it doesn't exist
INSERT INTO public.companies (id, name) 
VALUES ('00000000-0000-0000-0000-000000000000', 'Default Company')
ON CONFLICT (id) DO NOTHING;

-- Create default company settings if they don't exist
INSERT INTO public.company_settings (company_id, auto_import_emails, auto_send_to_ocr, auto_send_to_accounting)
VALUES ('00000000-0000-0000-0000-000000000000', false, false, false)
ON CONFLICT (company_id) DO NOTHING;

-- Create a membership for current users to the default company
-- This will allow users to access company settings
CREATE OR REPLACE FUNCTION create_default_membership()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Create membership for authenticated users if they don't have one
    INSERT INTO public.memberships (user_id, company_id, role)
    SELECT auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid, 'admin'::member_role
    WHERE auth.uid() IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM public.memberships 
        WHERE user_id = auth.uid()
    );
END;
$$;

-- Run the function to create membership for current user
SELECT create_default_membership();