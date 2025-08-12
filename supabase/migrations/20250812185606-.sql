-- Make sure the invoices bucket is public for easier access
UPDATE storage.buckets 
SET public = true 
WHERE id = 'invoices';

-- Create RLS policy for public read access to invoices
CREATE POLICY "Allow public read access to invoices" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'invoices');

-- Create policy for authenticated users to upload invoices
CREATE POLICY "Allow authenticated users to upload invoices" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'invoices' AND auth.uid() IS NOT NULL);

-- Create policy for users to access their own invoices
CREATE POLICY "Allow users to access their own invoices" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'invoices' AND auth.uid()::text = (storage.foldername(name))[1]);