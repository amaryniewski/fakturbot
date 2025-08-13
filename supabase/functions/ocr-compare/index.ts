import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ComparisonResult {
  field: string;
  ocrSpaceValue: any;
  claudeVisionValue: any;
  match: boolean;
  confidence: number;
  finalValue: any;
  reason: string;
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

function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const a = normalize(str1);
  const b = normalize(str2);
  
  if (a === b) return 1;
  
  // Levenshtein distance
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  const maxLength = Math.max(a.length, b.length);
  return maxLength > 0 ? 1 - matrix[b.length][a.length] / maxLength : 0;
}

function compareAmounts(amount1: number | undefined, amount2: number | undefined): { match: boolean; confidence: number } {
  if (!amount1 || !amount2) return { match: false, confidence: 0 };
  
  const diff = Math.abs(amount1 - amount2);
  const maxAmount = Math.max(amount1, amount2);
  const percentDiff = maxAmount > 0 ? diff / maxAmount : 0;
  
  if (percentDiff === 0) return { match: true, confidence: 1 };
  if (percentDiff <= 0.01) return { match: true, confidence: 0.95 }; // 1% tolerance
  if (percentDiff <= 0.05) return { match: false, confidence: 0.7 }; // 5% tolerance
  
  return { match: false, confidence: Math.max(0, 1 - percentDiff) };
}

function compareDates(date1: string | undefined, date2: string | undefined): { match: boolean; confidence: number } {
  if (!date1 || !date2) return { match: false, confidence: 0 };
  
  // Normalize date formats (try to parse different formats)
  const parseDate = (dateStr: string): Date | null => {
    // Try different formats: DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD, etc.
    const formats = [
      /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/,  // DD/MM/YYYY
      /(\d{4})[\/\.\-](\d{1,2})[\/\.\-](\d{1,2})/,  // YYYY-MM-DD
    ];
    
    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        const [, p1, p2, p3] = match;
        // Try both DD/MM/YYYY and YYYY-MM-DD interpretations
        const date1 = new Date(parseInt(p3), parseInt(p2) - 1, parseInt(p1));
        const date2 = new Date(parseInt(p1), parseInt(p2) - 1, parseInt(p3));
        
        if (!isNaN(date1.getTime())) return date1;
        if (!isNaN(date2.getTime())) return date2;
      }
    }
    return null;
  };
  
  const parsedDate1 = parseDate(date1);
  const parsedDate2 = parseDate(date2);
  
  if (!parsedDate1 || !parsedDate2) {
    // Fallback to string similarity
    const similarity = calculateStringSimilarity(date1, date2);
    return { match: similarity > 0.8, confidence: similarity };
  }
  
  const timeDiff = Math.abs(parsedDate1.getTime() - parsedDate2.getTime());
  const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
  
  if (daysDiff === 0) return { match: true, confidence: 1 };
  if (daysDiff <= 1) return { match: true, confidence: 0.9 };
  if (daysDiff <= 7) return { match: false, confidence: 0.6 };
  
  return { match: false, confidence: Math.max(0, 1 - daysDiff / 365) };
}

function compareFields(field: string, value1: any, value2: any, confidence1: number, confidence2: number): ComparisonResult {
  if (!value1 && !value2) {
    return {
      field,
      ocrSpaceValue: value1,
      claudeVisionValue: value2,
      match: true,
      confidence: 1,
      finalValue: null,
      reason: 'Both values are empty'
    };
  }
  
  if (!value1) {
    return {
      field,
      ocrSpaceValue: value1,
      claudeVisionValue: value2,
      match: false,
      confidence: confidence2,
      finalValue: value2,
      reason: 'Only Claude Vision provided value'
    };
  }
  
  if (!value2) {
    return {
      field,
      ocrSpaceValue: value1,
      claudeVisionValue: value2,
      match: false,
      confidence: confidence1,
      finalValue: value1,
      reason: 'Only OCR.space provided value'
    };
  }
  
  // Field-specific comparison logic
  let match = false;
  let fieldConfidence = 0;
  
  if (field.includes('Amount') || field.includes('amount')) {
    const comparison = compareAmounts(value1, value2);
    match = comparison.match;
    fieldConfidence = comparison.confidence;
  } else if (field.includes('Date') || field.includes('date')) {
    const comparison = compareDates(value1, value2);
    match = comparison.match;
    fieldConfidence = comparison.confidence;
  } else if (typeof value1 === 'string' && typeof value2 === 'string') {
    const similarity = calculateStringSimilarity(value1, value2);
    match = similarity > 0.8;
    fieldConfidence = similarity;
  } else {
    match = value1 === value2;
    fieldConfidence = match ? 1 : 0;
  }
  
  // Decide final value based on confidence and match
  let finalValue: any;
  let reason: string;
  
  if (match) {
    // Values match - choose the one with higher confidence
    finalValue = confidence1 >= confidence2 ? value1 : value2;
    reason = `Values match (${(fieldConfidence * 100).toFixed(1)}% similarity)`;
  } else {
    // Values don't match - choose based on confidence and field priority
    const fieldPriority = getFieldPriority(field);
    const adjustedConf1 = confidence1 * fieldPriority;
    const adjustedConf2 = confidence2 * fieldPriority;
    
    if (adjustedConf1 > adjustedConf2) {
      finalValue = value1;
      reason = `OCR.space confidence higher (${(confidence1 * 100).toFixed(1)}% vs ${(confidence2 * 100).toFixed(1)}%)`;
    } else {
      finalValue = value2;
      reason = `Claude Vision confidence higher (${(confidence2 * 100).toFixed(1)}% vs ${(confidence1 * 100).toFixed(1)}%)`;
    }
  }
  
  return {
    field,
    ocrSpaceValue: value1,
    claudeVisionValue: value2,
    match,
    confidence: fieldConfidence,
    finalValue,
    reason
  };
}

function getFieldPriority(field: string): number {
  // Higher priority for critical fields
  const priorityMap: { [key: string]: number } = {
    'totalAmount': 1.2,
    'invoiceNumber': 1.1,
    'vendorName': 1.0,
    'invoiceDate': 1.0,
    'currency': 1.0,
    'vatAmount': 0.9,
    'netAmount': 0.9,
    'dueDate': 0.8,
    'vendorVatId': 0.7,
    'vendorAddress': 0.6
  };
  
  return priorityMap[field] || 1.0;
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

    console.log(`Comparing OCR results for invoice: ${invoiceId}`);

    // Get OCR results from both providers
    const { data: ocrResults, error: ocrError } = await supabase
      .from('ocr_results')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('success', true)
      .order('created_at', { ascending: false });

    if (ocrError) {
      throw new Error(`Failed to fetch OCR results: ${ocrError.message}`);
    }

    const ocrSpaceResult = ocrResults?.find(r => r.provider === 'ocr_space');
    const claudeVisionResult = ocrResults?.find(r => r.provider === 'claude_vision');

    if (!ocrSpaceResult && !claudeVisionResult) {
      throw new Error('No successful OCR results found for comparison');
    }

    if (!ocrSpaceResult) {
      console.log('Only Claude Vision result available, using it directly');
      // Update invoice with Claude Vision data
      await supabase
        .from('invoices')
        .update({
          extracted_data: claudeVisionResult.structured_data,
          confidence_score: claudeVisionResult.confidence_score,
          status: 'success',
          needs_review: claudeVisionResult.confidence_score < 0.8
        })
        .eq('id', invoiceId);

      return new Response(
        JSON.stringify({
          success: true,
          provider: 'claude_vision_only',
          finalData: claudeVisionResult.structured_data,
          confidence: claudeVisionResult.confidence_score,
          needsReview: claudeVisionResult.confidence_score < 0.8
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!claudeVisionResult) {
      console.log('Only OCR.space result available, using it directly');
      // Update invoice with OCR.space data
      await supabase
        .from('invoices')
        .update({
          extracted_data: ocrSpaceResult.structured_data,
          confidence_score: ocrSpaceResult.confidence_score,
          status: 'success',
          needs_review: ocrSpaceResult.confidence_score < 0.8
        })
        .eq('id', invoiceId);

      return new Response(
        JSON.stringify({
          success: true,
          provider: 'ocr_space_only',
          finalData: ocrSpaceResult.structured_data,
          confidence: ocrSpaceResult.confidence_score,
          needsReview: ocrSpaceResult.confidence_score < 0.8
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Both results available - perform comparison
    const ocrSpaceData = ocrSpaceResult.structured_data as InvoiceData;
    const claudeVisionData = claudeVisionResult.structured_data as InvoiceData;
    
    const comparisons: ComparisonResult[] = [];
    const finalData: InvoiceData = {};
    
    // Compare all fields
    const fields = ['vendorName', 'invoiceNumber', 'invoiceDate', 'dueDate', 'totalAmount', 'currency', 'vatAmount', 'netAmount', 'vendorVatId', 'vendorAddress'];
    
    for (const field of fields) {
      const comparison = compareFields(
        field,
        ocrSpaceData[field as keyof InvoiceData],
        claudeVisionData[field as keyof InvoiceData],
        ocrSpaceResult.confidence_score,
        claudeVisionResult.confidence_score
      );
      
      comparisons.push(comparison);
      if (comparison.finalValue !== null && comparison.finalValue !== undefined) {
        (finalData as any)[field] = comparison.finalValue;
      }
    }

    // Calculate overall confidence
    const matchingFields = comparisons.filter(c => c.match).length;
    const totalFields = comparisons.filter(c => c.ocrSpaceValue || c.claudeVisionValue).length;
    const agreementRate = totalFields > 0 ? matchingFields / totalFields : 0;
    
    const avgConfidence = comparisons
      .filter(c => c.confidence > 0)
      .reduce((sum, c) => sum + c.confidence, 0) / Math.max(1, comparisons.filter(c => c.confidence > 0).length);
    
    const finalConfidence = (agreementRate * 0.6 + avgConfidence * 0.4);
    const needsReview = finalConfidence < 0.8 || agreementRate < 0.7;

    // Save comparison result
    const { data: comparisonResult, error: comparisonError } = await supabase
      .from('ocr_comparisons')
      .insert({
        invoice_id: invoiceId,
        ocr_space_result_id: ocrSpaceResult.id,
        claude_vision_result_id: claudeVisionResult.id,
        comparison_data: comparisons,
        final_decision: finalData,
        confidence_score: finalConfidence,
        needs_manual_review: needsReview
      })
      .select()
      .single();

    if (comparisonError) {
      console.error('Error saving comparison result:', comparisonError);
    }

    // Update invoice with final data
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        extracted_data: finalData,
        confidence_score: finalConfidence,
        status: 'success',
        needs_review: needsReview
      })
      .eq('id', invoiceId);

    if (updateError) {
      console.error('Error updating invoice:', updateError);
    }

    console.log(`OCR comparison completed for invoice ${invoiceId}. Agreement: ${(agreementRate * 100).toFixed(1)}%, Confidence: ${(finalConfidence * 100).toFixed(1)}%`);

    return new Response(
      JSON.stringify({
        success: true,
        agreementRate,
        finalConfidence,
        needsReview,
        comparisons,
        finalData,
        comparisonId: comparisonResult?.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('OCR comparison error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});