import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OCRSpaceResponse {
  ParsedResults?: Array<{
    TextOverlay?: {
      Lines?: Array<{
        LineText: string;
        Words?: Array<{
          WordText: string;
          Left: number;
          Top: number;
          Height: number;
          Width: number;
        }>;
      }>;
    };
    ParsedText: string;
  }>;
  OCRExitCode: number;
  IsErroredOnProcessing: boolean;
  ErrorMessage?: string;
  ErrorDetails?: string;
}

interface InvoiceData {
  vendorName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  totalAmount?: number;
  currency?: string;
  vatAmount?: number;
  netAmount?: number;
  vendorVatId?: string;
  vendorAddress?: string;
}

async function performOCRWithOCRSpace(fileUrl: string): Promise<string> {
  const ocrApiKey = Deno.env.get('OCR_SPACE_API_KEY') || 'K87899142388957';
  
  const formData = new FormData();
  formData.append('url', fileUrl);
  formData.append('apikey', ocrApiKey);
  formData.append('language', 'pol');
  formData.append('isOverlayRequired', 'false');
  formData.append('detectOrientation', 'true');
  formData.append('scale', 'true');
  formData.append('OCREngine', '2');
  
  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`OCR.space API error: ${response.status}`);
  }
  
  const result: OCRSpaceResponse = await response.json();
  
  if (result.IsErroredOnProcessing) {
    throw new Error(`OCR processing failed: ${result.ErrorMessage || 'Unknown error'}`);
  }
  
  return result.ParsedResults?.[0]?.ParsedText || '';
}

function extractInvoiceData(text: string): { data: InvoiceData; confidence: number } {
  const data: InvoiceData = {};
  let totalFields = 0;
  let foundFields = 0;

  // Vendor name extraction
  totalFields++;
  const vendorPatterns = [
    /(?:od|from|sprzedawca|vendor)[\s:]+([^\n\r]{2,50})/i,
    /^([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż\s]+(?:sp\.?\s*z\s*o\.?o\.?|s\.a\.|ltd|inc|gmbh))/im,
  ];
  
  for (const pattern of vendorPatterns) {
    const match = text.match(pattern);
    if (match) {
      data.vendorName = match[1].trim();
      foundFields++;
      break;
    }
  }

  // Invoice number
  totalFields++;
  const invoiceNumberMatch = text.match(/(?:faktura|invoice|nr|no)[\s.:]+([\w\/-]+)/i);
  if (invoiceNumberMatch) {
    data.invoiceNumber = invoiceNumberMatch[1];
    foundFields++;
  }

  // Dates
  totalFields += 2;
  const datePattern = /(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4})/g;
  const dates = text.match(datePattern);
  if (dates && dates.length > 0) {
    data.invoiceDate = dates[0];
    foundFields++;
    if (dates.length > 1) {
      data.dueDate = dates[1];
      foundFields++;
    }
  }

  // Total amount
  totalFields++;
  const amountPattern = /(?:suma|total|razem|do zapłaty)[\s:]*(\d+[.,]\d{2})/i;
  const amountMatch = text.match(amountPattern);
  if (amountMatch) {
    data.totalAmount = parseFloat(amountMatch[1].replace(',', '.'));
    foundFields++;
  }

  // Currency
  totalFields++;
  const currencyMatch = text.match(/\b(PLN|EUR|USD|GBP)\b/i);
  if (currencyMatch) {
    data.currency = currencyMatch[1].toUpperCase();
    foundFields++;
  }

  // VAT amount
  totalFields++;
  const vatMatch = text.match(/(?:vat|podatek)[\s:]*(\d+[.,]\d{2})/i);
  if (vatMatch) {
    data.vatAmount = parseFloat(vatMatch[1].replace(',', '.'));
    foundFields++;
  }

  const confidence = totalFields > 0 ? foundFields / totalFields : 0;
  return { data, confidence };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { invoiceId } = await req.json();
    
    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: 'invoiceId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing OCR.space for invoice: ${invoiceId}`);
    const startTime = Date.now();

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('file_url, user_id')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      throw new Error(`Invoice not found: ${invoiceError?.message}`);
    }

    if (!invoice.file_url) {
      throw new Error('No file URL found for invoice');
    }

    // Perform OCR
    const rawText = await performOCRWithOCRSpace(invoice.file_url);
    const { data: extractedData, confidence } = extractInvoiceData(rawText);
    
    const processingTime = Date.now() - startTime;

    // Save OCR result
    const { data: ocrResult, error: ocrError } = await supabase
      .from('ocr_results')
      .insert({
        invoice_id: invoiceId,
        provider: 'ocr_space',
        raw_text: rawText,
        structured_data: extractedData,
        confidence_score: confidence,
        processing_time_ms: processingTime,
        success: true
      })
      .select()
      .single();

    if (ocrError) {
      console.error('Error saving OCR result:', ocrError);
      throw new Error('Failed to save OCR result');
    }

    console.log(`OCR.space completed for invoice ${invoiceId} with confidence ${confidence}`);

    return new Response(
      JSON.stringify({
        success: true,
        provider: 'ocr_space',
        confidence: confidence,
        extractedData,
        processingTime,
        resultId: ocrResult.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('OCR.space processing error:', error);
    
    // Try to save error result if we have invoiceId
    try {
      const { invoiceId } = await req.json().catch(() => ({}));
      if (invoiceId) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('ocr_results')
          .insert({
            invoice_id: invoiceId,
            provider: 'ocr_space',
            success: false,
            error_message: error.message
          });
      }
    } catch (saveError) {
      console.error('Failed to save error result:', saveError);
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        provider: 'ocr_space'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});