import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OCRResult {
  invoiceId: string;
  extractedData?: {
    amount?: number;
    currency?: string;
    invoiceNumber?: string;
    issueDate?: string;
    dueDate?: string;
    vendorName?: string;
    vendorNIP?: string;
    confidence?: number;
  };
  status: 'success' | 'failed';
  errorMessage?: string;
  confidence?: number;
}

interface OCRWebhookPayload {
  invoices: OCRResult[];
  timestamp: string;
  action: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("ocr-webhook function called");
    const payload: OCRWebhookPayload = await req.json();
    console.log("Received OCR results:", JSON.stringify(payload, null, 2));

    if (!payload.invoices || !Array.isArray(payload.invoices)) {
      throw new Error("Invalid payload: missing invoices array");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const results = [];

    for (const invoice of payload.invoices) {
      console.log(`Processing OCR result for invoice ${invoice.invoiceId}`);
      
      try {
        // Prepare update data
        const updateData: any = {
          status: invoice.status,
          updated_at: new Date().toISOString(),
        };

        if (invoice.status === 'success' && invoice.extractedData) {
          updateData.extracted_data = invoice.extractedData;
          updateData.confidence_score = invoice.extractedData.confidence || invoice.confidence || 0.5;
          
          // Auto-approve logic could go here based on confidence and rules
          // For now, mark as needing review if confidence is low
          updateData.needs_review = (updateData.confidence_score < 0.8);
          
          if (!updateData.needs_review) {
            updateData.approved_at = new Date().toISOString();
          }
        } else if (invoice.status === 'failed') {
          updateData.error_message = invoice.errorMessage || 'OCR processing failed';
          updateData.needs_review = true;
        }

        // Update the invoice in the database
        const { data, error } = await supabase
          .from('invoices')
          .update(updateData)
          .eq('id', invoice.invoiceId)
          .select()
          .single();

        if (error) {
          console.error(`Error updating invoice ${invoice.invoiceId}:`, error);
          results.push({
            invoiceId: invoice.invoiceId,
            success: false,
            error: error.message
          });
        } else {
          console.log(`Successfully updated invoice ${invoice.invoiceId}`);
          results.push({
            invoiceId: invoice.invoiceId,
            success: true,
            data: data
          });
        }

      } catch (invoiceError: any) {
        console.error(`Error processing invoice ${invoice.invoiceId}:`, invoiceError);
        results.push({
          invoiceId: invoice.invoiceId,
          success: false,
          error: invoiceError.message
        });
      }
    }

    console.log("OCR webhook processing completed:", results);

    return new Response(JSON.stringify({
      success: true,
      processed: payload.invoices.length,
      results: results,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error in ocr-webhook function:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);