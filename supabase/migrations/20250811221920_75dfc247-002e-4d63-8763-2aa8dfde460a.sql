-- Add email source columns to invoices table
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS extracted_data JSONB,
ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- Create table for storing invoice processing rules
CREATE TABLE IF NOT EXISTS public.invoice_processing_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  rule_type TEXT NOT NULL, -- 'auto_approve', 'sender_whitelist', 'amount_threshold'
  rule_config JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoice_processing_rules ENABLE ROW LEVEL SECURITY;

-- Create policies for invoice_processing_rules
CREATE POLICY "Users can view their own processing rules" 
ON public.invoice_processing_rules 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own processing rules" 
ON public.invoice_processing_rules 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own processing rules" 
ON public.invoice_processing_rules 
FOR UPDATE 
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own processing rules" 
ON public.invoice_processing_rules 
FOR DELETE 
USING (user_id = auth.uid());

-- Update trigger for processing rules
CREATE TRIGGER update_invoice_processing_rules_updated_at
BEFORE UPDATE ON public.invoice_processing_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();