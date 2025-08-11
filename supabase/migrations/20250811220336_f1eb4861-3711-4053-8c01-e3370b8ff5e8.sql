-- Add unique constraint for invoice upserts
ALTER TABLE public.invoices 
ADD CONSTRAINT unique_user_file UNIQUE (user_id, file_name);