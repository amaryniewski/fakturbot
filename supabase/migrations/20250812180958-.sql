-- Encrypt any existing unencrypted tokens and strengthen security
-- This addresses the scanner's concern about tokens stored in plaintext

-- Function to encrypt existing unencrypted tokens
CREATE OR REPLACE FUNCTION public.encrypt_existing_tokens()
RETURNS TABLE(
    table_name text,
    tokens_encrypted integer,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    gmail_count integer := 0;
    fakturownia_count integer := 0;
    mailbox_count integer := 0;
BEGIN
    -- Encrypt unencrypted Gmail tokens
    UPDATE public.gmail_connections 
    SET 
        access_token = encrypt_token(access_token),
        refresh_token = CASE 
            WHEN refresh_token IS NOT NULL AND refresh_token NOT LIKE '%::%' 
            THEN encrypt_token(refresh_token) 
            ELSE refresh_token 
        END
    WHERE access_token IS NOT NULL 
    AND access_token NOT LIKE '%::%';
    
    GET DIAGNOSTICS gmail_count = ROW_COUNT;
    
    -- Encrypt unencrypted Fakturownia tokens
    UPDATE public.fakturownia_connections
    SET api_token = encrypt_token(api_token)
    WHERE api_token IS NOT NULL 
    AND api_token NOT LIKE '%::%';
    
    GET DIAGNOSTICS fakturownia_count = ROW_COUNT;
    
    -- Encrypt unencrypted mailbox tokens  
    UPDATE public.mailbox_tokens
    SET 
        access_token = encrypt_token(access_token),
        refresh_token = CASE 
            WHEN refresh_token IS NOT NULL AND refresh_token NOT LIKE '%::%'
            THEN encrypt_token(refresh_token)
            ELSE refresh_token
        END
    WHERE access_token IS NOT NULL 
    AND access_token NOT LIKE '%::%';
    
    GET DIAGNOSTICS mailbox_count = ROW_COUNT;
    
    -- Return results
    RETURN QUERY VALUES 
        ('gmail_connections'::text, gmail_count, 'Encrypted'::text),
        ('fakturownia_connections'::text, fakturownia_count, 'Encrypted'::text),
        ('mailbox_tokens'::text, mailbox_count, 'Encrypted'::text);
END;
$function$;

-- Execute the encryption for existing tokens
SELECT * FROM public.encrypt_existing_tokens();

-- Add additional protection: Create a function that validates all tokens are encrypted
CREATE OR REPLACE FUNCTION public.validate_all_tokens_encrypted()
RETURNS TABLE(
    table_name text,
    unencrypted_tokens integer,
    security_status text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT 'gmail_connections'::text, 
           COUNT(*)::integer,
           CASE WHEN COUNT(*) = 0 THEN 'SECURE' ELSE 'INSECURE' END::text
    FROM public.gmail_connections 
    WHERE (access_token IS NOT NULL AND access_token NOT LIKE '%::%')
       OR (refresh_token IS NOT NULL AND refresh_token NOT LIKE '%::%')
    
    UNION ALL
    
    SELECT 'fakturownia_connections'::text,
           COUNT(*)::integer,
           CASE WHEN COUNT(*) = 0 THEN 'SECURE' ELSE 'INSECURE' END::text
    FROM public.fakturownia_connections
    WHERE api_token IS NOT NULL AND api_token NOT LIKE '%::%'
    
    UNION ALL
    
    SELECT 'mailbox_tokens'::text,
           COUNT(*)::integer,
           CASE WHEN COUNT(*) = 0 THEN 'SECURE' ELSE 'INSECURE' END::text
    FROM public.mailbox_tokens
    WHERE (access_token IS NOT NULL AND access_token NOT LIKE '%::%')
       OR (refresh_token IS NOT NULL AND refresh_token NOT LIKE '%::%');
$function$;

-- Create triggers to ensure all new tokens are automatically encrypted
CREATE OR REPLACE FUNCTION public.ensure_token_encryption()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- For gmail_connections table
    IF TG_TABLE_NAME = 'gmail_connections' THEN
        IF NEW.access_token IS NOT NULL AND NEW.access_token NOT LIKE '%::%' THEN
            NEW.access_token := encrypt_token(NEW.access_token);
        END IF;
        IF NEW.refresh_token IS NOT NULL AND NEW.refresh_token NOT LIKE '%::%' THEN
            NEW.refresh_token := encrypt_token(NEW.refresh_token);
        END IF;
    END IF;
    
    -- For fakturownia_connections table  
    IF TG_TABLE_NAME = 'fakturownia_connections' THEN
        IF NEW.api_token IS NOT NULL AND NEW.api_token NOT LIKE '%::%' THEN
            NEW.api_token := encrypt_token(NEW.api_token);
        END IF;
    END IF;
    
    -- For mailbox_tokens table
    IF TG_TABLE_NAME = 'mailbox_tokens' THEN
        IF NEW.access_token IS NOT NULL AND NEW.access_token NOT LIKE '%::%' THEN
            NEW.access_token := encrypt_token(NEW.access_token);
        END IF;
        IF NEW.refresh_token IS NOT NULL AND NEW.refresh_token NOT LIKE '%::%' THEN
            NEW.refresh_token := encrypt_token(NEW.refresh_token);
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$;

-- Create triggers on all token tables
DROP TRIGGER IF EXISTS encrypt_gmail_tokens_trigger ON public.gmail_connections;
CREATE TRIGGER encrypt_gmail_tokens_trigger
    BEFORE INSERT OR UPDATE ON public.gmail_connections
    FOR EACH ROW EXECUTE FUNCTION public.ensure_token_encryption();

DROP TRIGGER IF EXISTS encrypt_fakturownia_tokens_trigger ON public.fakturownia_connections;
CREATE TRIGGER encrypt_fakturownia_tokens_trigger
    BEFORE INSERT OR UPDATE ON public.fakturownia_connections
    FOR EACH ROW EXECUTE FUNCTION public.ensure_token_encryption();

DROP TRIGGER IF EXISTS encrypt_mailbox_tokens_trigger ON public.mailbox_tokens;
CREATE TRIGGER encrypt_mailbox_tokens_trigger
    BEFORE INSERT OR UPDATE ON public.mailbox_tokens
    FOR EACH ROW EXECUTE FUNCTION public.ensure_token_encryption();