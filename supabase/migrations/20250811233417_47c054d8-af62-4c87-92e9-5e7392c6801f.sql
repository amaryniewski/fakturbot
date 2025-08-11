-- Add INSERT policies for companies and memberships tables needed by IMAP connection

-- Policy to allow users to create companies (needed when connecting IMAP)
CREATE POLICY "Users can create companies" 
ON public.companies 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Policy to allow users to create memberships (needed when connecting IMAP)
CREATE POLICY "Users can create memberships" 
ON public.memberships 
FOR INSERT 
TO authenticated
WITH CHECK (user_id = auth.uid());