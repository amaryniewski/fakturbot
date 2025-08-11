-- Create secure table for Fakturownia API connections
CREATE TABLE public.fakturownia_connections (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    company_name text NOT NULL,
    domain text NOT NULL, -- subdomena.fakturownia.pl
    api_token text NOT NULL, -- encrypted token
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(user_id, domain)
);

-- Enable RLS
ALTER TABLE public.fakturownia_connections ENABLE ROW LEVEL SECURITY;

-- Create policies similar to gmail_connections
CREATE POLICY "Users can view their own Fakturownia connections" 
ON public.fakturownia_connections 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own Fakturownia connections" 
ON public.fakturownia_connections 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Fakturownia connections" 
ON public.fakturownia_connections 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Fakturownia connections" 
ON public.fakturownia_connections 
FOR DELETE 
USING (auth.uid() = user_id);

-- Function to insert encrypted Fakturownia connection
CREATE OR REPLACE FUNCTION public.insert_encrypted_fakturownia_connection(
    p_company_name text,
    p_domain text,
    p_api_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    connection_id uuid;
BEGIN
    -- Validate user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    INSERT INTO public.fakturownia_connections (
        user_id,
        company_name,
        domain,
        api_token
    ) VALUES (
        auth.uid(),
        p_company_name,
        p_domain,
        encrypt_token(p_api_token)
    ) 
    ON CONFLICT (user_id, domain) 
    DO UPDATE SET
        company_name = p_company_name,
        api_token = encrypt_token(p_api_token),
        is_active = true,
        updated_at = now()
    RETURNING id INTO connection_id;
    
    RETURN connection_id;
END;
$$;

-- Function to get decrypted Fakturownia tokens
CREATE OR REPLACE FUNCTION public.get_decrypted_fakturownia_connection(p_connection_id uuid)
RETURNS TABLE(
    company_name text,
    domain text, 
    api_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Validate user owns this connection
    IF NOT EXISTS (
        SELECT 1 FROM public.fakturownia_connections 
        WHERE id = p_connection_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Connection not found or access denied';
    END IF;
    
    RETURN QUERY
    SELECT 
        fc.company_name,
        fc.domain,
        decrypt_token(fc.api_token) as api_token
    FROM public.fakturownia_connections fc
    WHERE fc.id = p_connection_id AND fc.user_id = auth.uid();
END;
$$;

-- Add trigger for updated_at
CREATE TRIGGER update_fakturownia_connections_updated_at
BEFORE UPDATE ON public.fakturownia_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();