-- Create table for storing OCR results from different providers
CREATE TABLE public.ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('ocr_space', 'google_document_ai')),
  raw_text TEXT,
  structured_data JSONB,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  processing_time_ms INTEGER,
  success BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create table for OCR comparisons
CREATE TABLE public.ocr_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE CASCADE,
  ocr_space_result_id UUID REFERENCES public.ocr_results(id),
  google_ai_result_id UUID REFERENCES public.ocr_results(id),
  comparison_data JSONB,
  final_decision JSONB,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  needs_manual_review BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_ocr_results_invoice_provider ON public.ocr_results(invoice_id, provider);
CREATE INDEX idx_ocr_results_created_at ON public.ocr_results(created_at);
CREATE INDEX idx_ocr_comparisons_invoice ON public.ocr_comparisons(invoice_id);

-- Enable RLS
ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_comparisons ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for ocr_results
CREATE POLICY "Users can view OCR results for their invoices" 
ON public.ocr_results FOR SELECT 
USING (
  invoice_id IN (
    SELECT id FROM public.invoices WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service can insert OCR results" 
ON public.ocr_results FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service can update OCR results" 
ON public.ocr_results FOR UPDATE 
USING (true);

-- Create RLS policies for ocr_comparisons
CREATE POLICY "Users can view OCR comparisons for their invoices" 
ON public.ocr_comparisons FOR SELECT 
USING (
  invoice_id IN (
    SELECT id FROM public.invoices WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service can insert OCR comparisons" 
ON public.ocr_comparisons FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service can update OCR comparisons" 
ON public.ocr_comparisons FOR UPDATE 
USING (true);