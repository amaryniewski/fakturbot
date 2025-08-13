-- Step 1: Fix duplicate invoice handling with better unique constraint
-- Drop existing constraint and add new one based on gmail_message_id + user_id
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS unique_user_file;

-- Add new unique constraint to prevent duplicates per user per message
CREATE UNIQUE INDEX unique_user_message_attachment 
ON public.invoices (user_id, gmail_message_id, file_name) 
WHERE gmail_message_id IS NOT NULL;

-- Step 2: Add audit columns for better tracking
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS processing_attempts integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_processing_error text;

-- Step 3: Create function to get user-specific invoice count
CREATE OR REPLACE FUNCTION public.get_user_invoice_stats(p_user_id uuid)
RETURNS TABLE(
  total_count integer,
  new_count integer, 
  processing_count integer,
  success_count integer,
  failed_count integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT 
    COUNT(*)::integer as total_count,
    COUNT(CASE WHEN status = 'new' THEN 1 END)::integer as new_count,
    COUNT(CASE WHEN status = 'processing' THEN 1 END)::integer as processing_count, 
    COUNT(CASE WHEN status = 'success' THEN 1 END)::integer as success_count,
    COUNT(CASE WHEN status = 'failed' THEN 1 END)::integer as failed_count
  FROM public.invoices 
  WHERE user_id = p_user_id;
$$;