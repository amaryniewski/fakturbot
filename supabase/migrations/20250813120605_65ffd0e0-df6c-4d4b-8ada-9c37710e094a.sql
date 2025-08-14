-- Dodanie tabeli ustawień filtrowania Gmail
CREATE TABLE public.gmail_filter_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filter_query TEXT NOT NULL DEFAULT 'has:attachment is:unread subject:invoice OR subject:faktura OR subject:fakturę OR subject:faktury',
  allowed_sender_emails TEXT[] DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Włącz RLS
ALTER TABLE public.gmail_filter_settings ENABLE ROW LEVEL SECURITY;

-- Polityki RLS dla ustawień filtrów
CREATE POLICY "Users can view their own filter settings" 
ON public.gmail_filter_settings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own filter settings" 
ON public.gmail_filter_settings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own filter settings" 
ON public.gmail_filter_settings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own filter settings" 
ON public.gmail_filter_settings 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger dla updated_at
CREATE TRIGGER update_gmail_filter_settings_updated_at
BEFORE UPDATE ON public.gmail_filter_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();