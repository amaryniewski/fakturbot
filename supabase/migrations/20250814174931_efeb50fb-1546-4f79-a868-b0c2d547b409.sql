-- Clear storage files through SQL function
DO $$
DECLARE
    file_record RECORD;
BEGIN
    -- Delete all files from invoices bucket
    DELETE FROM storage.objects WHERE bucket_id = 'invoices';
    
    -- Log the cleanup
    RAISE NOTICE 'Cleared all files from invoices storage bucket';
END $$;