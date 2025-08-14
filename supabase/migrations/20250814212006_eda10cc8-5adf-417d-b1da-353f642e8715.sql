-- Drop the existing unique constraint that prevents same email from different users
ALTER TABLE public.gmail_connections DROP CONSTRAINT IF EXISTS unique_active_gmail_email;

-- Add new constraint that allows same email for different users, but prevents duplicates per user
ALTER TABLE public.gmail_connections 
ADD CONSTRAINT unique_user_gmail_email 
UNIQUE (user_id, email);