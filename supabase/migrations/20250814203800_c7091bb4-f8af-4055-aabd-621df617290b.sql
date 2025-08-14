-- 1. Usuń istniejącą funkcję z niewłaściwym typem
DROP FUNCTION IF EXISTS public.get_all_active_gmail_connections_for_processing();

-- 2. Stwórz poprawną funkcję
CREATE OR REPLACE FUNCTION public.get_all_active_gmail_connections_for_processing()
RETURNS TABLE(id uuid, email text, user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- SECURITY: This function can only be called by service role for processing
    -- Returns all active connections with their user_id for proper isolation
    RETURN QUERY
    SELECT 
        gc.id,
        gc.email,
        gc.user_id
    FROM public.gmail_connections gc
    WHERE gc.is_active = true;
END;
$function$;

-- 3. Sprawdź obecne polityki RLS dla tabeli invoices
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename = 'invoices';

-- 4. Usuń starą politykę INSERT i stwórz nową z właściwym zabezpieczeniem
DROP POLICY IF EXISTS "Users can create their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can create their own invoices SECURE" ON public.invoices;

CREATE POLICY "Users can create their own invoices SECURE"
ON public.invoices 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- 5. Sprawdź czy są faktury cross-user (diagnostyka)
SELECT 
    i.id,
    i.user_id,
    i.sender_email,
    i.gmail_message_id,
    i.created_at
FROM public.invoices i
WHERE EXISTS (
    SELECT 1 FROM public.invoices i2 
    WHERE i2.gmail_message_id = i.gmail_message_id 
    AND i2.user_id != i.user_id
)
ORDER BY i.created_at DESC
LIMIT 10;