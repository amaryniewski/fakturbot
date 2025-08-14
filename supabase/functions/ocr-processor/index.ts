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
    
    // For now, return empty string since we don't have real OCR implementation
    // This prevents dummy data from being inserted into the database
    // TODO: Implement actual PDF text extraction
    console.log('OCR processing skipped - no real implementation yet');
    return '';
    
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
    const { invoiceId, userId } = await req.json();
    console.log('OCR processor called for invoice:', invoiceId, 'user:', userId);

    if (!invoiceId) {
      throw new Error('Invoice ID is required');
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // CRITICAL SECURITY: Always validate user access to invoice first
    if (!userId) {
      throw new Error('User ID is required for security validation');
    }
    
    // CRITICAL: Enhanced invoice ownership validation with security logging
    const { data: hasAccess } = await supabase
      .rpc('validate_invoice_ownership_enhanced', { 
        p_invoice_id: invoiceId, 
        p_user_id: userId 
      });
    
    if (!hasAccess) {
      console.error(`❌ CRITICAL SECURITY: Invoice ${invoiceId} ownership validation failed for user ${userId}`);
      await supabase.rpc('audit_user_data_access', {
        p_user_id: userId,
        p_operation: 'ocr_invoice_SECURITY_ACCESS_DENIED',
        p_table_name: 'invoices',
        p_details: { invoice_id: invoiceId, source: 'ocr-processor' }
      });
      throw new Error('Access denied: Invoice not found or not authorized');
    }

    // Get the invoice record with enhanced security validation
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .eq('user_id', userId) // CRITICAL: Double-check user_id match
      .single();

    if (invoiceError || !invoice) {
      console.error(`❌ FAILED to fetch invoice ${invoiceId}:`, invoiceError);
      await supabase.rpc('audit_user_data_access', {
        p_user_id: userId,
        p_operation: 'invoice_fetch_SECURITY_FAILED',
        p_table_name: 'invoices',
        p_details: { invoice_id: invoiceId, error: invoiceError?.message }
      });
      throw new Error('Invoice not found');
    }
    
    // CRITICAL: Verify user_id matches exactly
    if (invoice.user_id !== userId) {
      console.error(`🚨 CRITICAL SECURITY VIOLATION: Invoice user_id mismatch! Expected: ${userId}, Got: ${invoice.user_id}`);
      await supabase.rpc('audit_user_data_access', {
        p_user_id: userId,
        p_operation: 'ocr_invoice_SECURITY_USER_ID_MISMATCH',
        p_table_name: 'invoices',
        p_details: { 
          invoice_id: invoiceId,
          expected_user: userId,
          actual_user: invoice.user_id
        }
      });
      throw new Error('Security violation: user_id mismatch');
    }
    
    console.log(`🔍 Processing OCR for invoice ${invoiceId} owned by user ${invoice.user_id}`);

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