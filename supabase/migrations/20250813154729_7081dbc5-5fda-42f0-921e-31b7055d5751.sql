-- Clean database from all invoice-related data for fresh testing
-- This will remove all invoices, OCR results, and comparisons while keeping user settings and connections

-- Delete all OCR comparisons first (has foreign keys to ocr_results and invoices)
DELETE FROM public.ocr_comparisons;

-- Delete all OCR results
DELETE FROM public.ocr_results;

-- Delete all invoices
DELETE FROM public.invoices;

-- Reset any processing rules (optional - keeps user settings but clears rules)
DELETE FROM public.invoice_processing_rules;

-- Reset audit logs related to invoices (optional - keeps security logs clean)
DELETE FROM public.security_audit_log WHERE table_name IN ('invoices', 'ocr_results', 'ocr_comparisons');