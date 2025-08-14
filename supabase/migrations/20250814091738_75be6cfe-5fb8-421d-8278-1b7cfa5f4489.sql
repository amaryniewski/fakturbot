-- Faza 1: Rozszerzenie tabeli invoices o nowe kolumny dla danych strukturalnych
ALTER TABLE public.invoices 
ADD COLUMN vendor_name text,
ADD COLUMN vendor_nip text,
ADD COLUMN buyer_name text, 
ADD COLUMN buyer_nip text,
ADD COLUMN total_net numeric,
ADD COLUMN total_vat numeric,
ADD COLUMN total_gross numeric,
ADD COLUMN ocr_provider text DEFAULT 'legacy';

-- Utworzenie tabeli invoice_items dla pozycji faktur
CREATE TABLE public.invoice_items (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    invoice_id uuid NOT NULL,
    user_id uuid NOT NULL,
    item_name text NOT NULL,
    quantity numeric,
    unit_price numeric,
    net_amount numeric,
    vat_rate numeric,
    vat_amount numeric,
    gross_amount numeric,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS na invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- RLS policies dla invoice_items
CREATE POLICY "Users can view their own invoice items" 
ON public.invoice_items 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own invoice items" 
ON public.invoice_items 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoice items" 
ON public.invoice_items 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoice items" 
ON public.invoice_items 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger dla updated_at na invoice_items
CREATE TRIGGER update_invoice_items_updated_at
BEFORE UPDATE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index dla wydajności
CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX idx_invoice_items_user_id ON public.invoice_items(user_id);