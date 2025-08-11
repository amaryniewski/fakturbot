import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OCRResult {
  amount?: number;
  currency?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  vendorName?: string;
  vendorNIP?: string;
  confidence: number;
}

const extractInvoiceData = (text: string): OCRResult => {
  const result: OCRResult = { confidence: 0.5 };
  
  // Extract amount (various Polish formats)
  const amountRegex = /(?:suma|total|razem|do zapłaty|wartość)[\s:]*(\d+[.,]\d{2})\s*(?:zł|pln)/i;
  const amountMatch = text.match(amountRegex);
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1].replace(',', '.'));
    result.confidence += 0.2;
  }

  // Extract currency
  if (text.match(/zł|pln/i)) {
    result.currency = 'PLN';
    result.confidence += 0.1;
  }

  // Extract invoice number
  const invoiceNumberRegex = /(?:faktura|invoice)[\s\#]*([A-Z0-9\/\-]+)/i;
  const invoiceMatch = text.match(invoiceNumberRegex);
  if (invoiceMatch) {
    result.invoiceNumber = invoiceMatch[1];
    result.confidence += 0.2;
  }

  // Extract dates
  const dateRegex = /(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{4})/g;
  const dates = text.match(dateRegex);
  if (dates && dates.length > 0) {
    result.issueDate = dates[0];
    if (dates.length > 1) {
      result.dueDate = dates[1];
    }
    result.confidence += 0.1;
  }

  // Extract vendor NIP
  const nipRegex = /(?:nip|tax id)[\s:]*(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})/i;
  const nipMatch = text.match(nipRegex);
  if (nipMatch) {
    result.vendorNIP = nipMatch[1].replace(/[-\s]/g, '');
    result.confidence += 0.2;
  }

  // Extract vendor name (simple heuristic)
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0) {
    result.vendorName = lines[0].trim();
  }

  return result;
};

const performOCR = async (fileUrl: string): Promise<string> => {
  // For MVP, we'll use a simple text extraction
  // In production, integrate with Google Cloud Vision, AWS Textract, or similar
  
  try {
    // Download the PDF
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error('Failed to download PDF');
    }
    
    // For now, return mock OCR text
    // TODO: Implement actual PDF text extraction
    return `
      FAKTURA NR F/2024/001
      Data wystawienia: 15.01.2024
      Termin płatności: 29.01.2024
      
      Sprzedawca:
      Firma Example Sp. z o.o.
      NIP: 123-456-78-90
      
      Do zapłaty: 1,230.00 zł
    `;
    
  } catch (error) {
    console.error('OCR processing failed:', error);
    throw error;
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileName, userId } = await req.json();
    
    if (!fileName || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing fileName or userId' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the invoice record
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .eq('file_url', `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/invoices/${fileName}`)
      .single();

    if (invoiceError || !invoice) {
      throw new Error('Invoice not found');
    }

    // Update status to processing
    await supabase
      .from('invoices')
      .update({ status: 'processing' })
      .eq('id', invoice.id);

    try {
      // Perform OCR
      const ocrText = await performOCR(invoice.file_url);
      
      // Extract structured data
      const extractedData = extractInvoiceData(ocrText);
      
      // Check auto-approval rules
      const { data: rules } = await supabase
        .from('invoice_processing_rules')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      let needsReview = true;
      
      // Simple auto-approval logic
      if (rules && rules.length > 0) {
        for (const rule of rules) {
          if (rule.rule_type === 'sender_whitelist') {
            const whitelistedSenders = rule.rule_config.senders || [];
            if (whitelistedSenders.includes(invoice.sender_email)) {
              needsReview = false;
              break;
            }
          } else if (rule.rule_type === 'amount_threshold') {
            const threshold = rule.rule_config.maxAmount || 1000;
            if (extractedData.amount && extractedData.amount <= threshold) {
              needsReview = false;
            }
          }
        }
      }

      // Update invoice with extracted data
      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          status: 'success',
          extracted_data: extractedData,
          confidence_score: extractedData.confidence,
          needs_review: needsReview,
          approved_at: needsReview ? null : new Date().toISOString(),
          approved_by: needsReview ? null : userId
        })
        .eq('id', invoice.id);

      if (updateError) {
        throw updateError;
      }

      console.log(`OCR completed for invoice ${invoice.id}, needs review: ${needsReview}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          invoiceId: invoice.id,
          extractedData,
          needsReview 
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );

    } catch (ocrError) {
      // Update status to failed
      await supabase
        .from('invoices')
        .update({ 
          status: 'failed',
          error_message: ocrError.message 
        })
        .eq('id', invoice.id);

      throw ocrError;
    }

  } catch (error: any) {
    console.error("Error in ocr-processor:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      }
    );
  }
};

serve(handler);