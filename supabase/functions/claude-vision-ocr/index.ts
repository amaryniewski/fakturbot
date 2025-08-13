import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

async function analyzeInvoiceWithClaude(fileUrl: string): Promise<{ data: InvoiceData; confidence: number; rawResponse: string }> {
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
  
  if (!anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  // First, fetch the image as base64
  const imageResponse = await fetch(fileUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  }
  
  const imageBuffer = await imageResponse.arrayBuffer();
  const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
  
  // Determine media type based on file extension or content type
  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
  
  const systemPrompt = `You are an expert invoice data extraction specialist. Analyze the provided invoice image and extract key information.

Return a JSON response with this exact structure:
{
  "vendorName": "Company name who issued the invoice",
  "invoiceNumber": "Invoice number/ID",
  "invoiceDate": "Invoice date in DD/MM/YYYY format",
  "dueDate": "Due date in DD/MM/YYYY format",
  "totalAmount": "Total amount as number (e.g., 1234.56)",
  "currency": "Currency code (PLN, EUR, USD, etc.)",
  "vatAmount": "VAT amount as number",
  "netAmount": "Net amount as number",
  "vendorVatId": "Vendor VAT ID/NIP",
  "vendorAddress": "Vendor address",
  "confidence": "Overall confidence score 0-1"
}

Focus on accuracy. If you cannot confidently extract a field, set it to null.
For Polish invoices: Look for "NIP" for VAT ID, "PLN" for currency, "Faktura" for invoice.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: systemPrompt,
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: contentType,
                data: base64Image,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const rawResponse = result.content[0].text;

  // Extract JSON from response
  let extractedData: InvoiceData & { confidence?: number } = {};
  let confidence = 0.5; // Default confidence

  try {
    // Try to find JSON in the response
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      confidence = parsed.confidence || 0.5;
      delete parsed.confidence; // Remove confidence from data
      extractedData = parsed;
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (parseError) {
    console.error('Failed to parse Claude response:', parseError);
    // Fallback: try to extract basic information using regex
    const lines = rawResponse.split('\n');
    for (const line of lines) {
      if (line.includes('vendorName') || line.includes('company')) {
        const match = line.match(/"([^"]+)"/);
        if (match) extractedData.vendorName = match[1];
      }
      // Add more fallback extractions as needed
    }
    confidence = 0.3; // Lower confidence for fallback extraction
  }

  return {
    data: extractedData,
    confidence,
    rawResponse
  };
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

    console.log(`Processing Claude Vision OCR for invoice: ${invoiceId}`);
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

    // Analyze with Claude
    const { data: extractedData, confidence, rawResponse } = await analyzeInvoiceWithClaude(invoice.file_url);
    
    const processingTime = Date.now() - startTime;

    // Save OCR result
    const { data: ocrResult, error: ocrError } = await supabase
      .from('ocr_results')
      .insert({
        invoice_id: invoiceId,
        provider: 'claude_vision',
        raw_text: rawResponse,
        structured_data: extractedData,
        confidence_score: confidence,
        processing_time_ms: processingTime,
        success: true
      })
      .select()
      .single();

    if (ocrError) {
      console.error('Error saving Claude OCR result:', ocrError);
      throw new Error('Failed to save OCR result');
    }

    console.log(`Claude Vision OCR completed for invoice ${invoiceId} with confidence ${confidence}`);

    return new Response(
      JSON.stringify({
        success: true,
        provider: 'claude_vision',
        confidence: confidence,
        extractedData,
        processingTime,
        resultId: ocrResult.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Claude Vision OCR processing error:', error);
    
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
            provider: 'claude_vision',
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
        provider: 'claude_vision'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});