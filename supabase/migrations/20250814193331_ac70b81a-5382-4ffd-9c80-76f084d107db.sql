-- CRITICAL SECURITY PLAN IMPLEMENTATION
-- Phase 1: Core Security Functions for Gmail Message Ownership

-- Function to get Gmail message owner from connection data
CREATE OR REPLACE FUNCTION public.get_gmail_message_owner(p_gmail_message_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    message_owner_id uuid;
BEGIN
    -- Get user_id from existing invoice with this gmail_message_id
    SELECT user_id INTO message_owner_id
    FROM public.invoices 
    WHERE gmail_message_id = p_gmail_message_id
    LIMIT 1;
    
    RETURN message_owner_id;
END;
$$;

-- Function to validate invoice-gmail ownership consistency
CREATE OR REPLACE FUNCTION public.validate_invoice_gmail_ownership(p_user_id uuid, p_gmail_message_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    existing_owner_id uuid;
BEGIN
    -- If no gmail_message_id provided, allow (for non-Gmail invoices)
    IF p_gmail_message_id IS NULL THEN
        RETURN true;
    END IF;
    
    -- Check if this message already exists for a different user
    SELECT user_id INTO existing_owner_id
    FROM public.invoices 
    WHERE gmail_message_id = p_gmail_message_id
    AND user_id != p_user_id
    LIMIT 1;
    
    -- If found different owner, this is a security violation
    IF existing_owner_id IS NOT NULL THEN
        -- Log critical security violation
        PERFORM public.audit_user_data_access(
            p_user_id,
            'CRITICAL_GMAIL_MESSAGE_CROSS_USER_VIOLATION',
            'invoices',
            jsonb_build_object(
                'gmail_message_id', p_gmail_message_id,
                'existing_owner', existing_owner_id,
                'attempted_by', p_user_id
            )
        );
        RETURN false;
    END IF;
    
    RETURN true;
END;
$$;