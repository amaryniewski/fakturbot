-- Create table for Gmail connections
CREATE TABLE public.gmail_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own Gmail connections" 
ON public.gmail_connections 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own Gmail connections" 
ON public.gmail_connections 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Gmail connections" 
ON public.gmail_connections 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Gmail connections" 
ON public.gmail_connections 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_gmail_connections_updated_at
BEFORE UPDATE ON public.gmail_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table for processing invoices
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  gmail_message_id TEXT,
  sender_email TEXT NOT NULL,
  subject TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_url TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'queued', 'processing', 'success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security for invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Create policies for invoices
CREATE POLICY "Users can view their own invoices" 
ON public.invoices 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own invoices" 
ON public.invoices 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own invoices" 
ON public.invoices 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own invoices" 
ON public.invoices 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates on invoices
CREATE TRIGGER update_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();