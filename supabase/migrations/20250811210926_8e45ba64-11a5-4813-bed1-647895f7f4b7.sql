-- Fix critical security vulnerability in mailbox_tokens table
-- Remove the overly permissive policy that allows unrestricted access
DROP POLICY IF EXISTS "Allow service access to mailbox tokens" ON public.mailbox_tokens;

-- Create a secure policy that only allows access to mailbox tokens
-- for mailboxes belonging to companies where the user is a member
CREATE POLICY "Users can access tokens for their company mailboxes"
ON public.mailbox_tokens
FOR ALL
USING (
  EXISTS (
    SELECT 1 
    FROM public.mailboxes m 
    WHERE m.id = mailbox_tokens.mailbox_id 
    AND is_member(m.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.mailboxes m 
    WHERE m.id = mailbox_tokens.mailbox_id 
    AND is_member(m.company_id)
  )
);