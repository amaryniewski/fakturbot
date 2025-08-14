import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedInvoiceData {
  vendorName: string;
  vendorNIP: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  confidence: number;
}

// Support both array format from n8n and single item format
interface OCRWebhookPayload {
  // Array format from n8n Parse and Validate JSON
  parsedData?: ParsedInvoiceData[];
  invoiceId?: string;
  
  // Alternative single item format
  invoice_id?: string;
  parsed_data?: ParsedInvoiceData[];
  success?: boolean;
  error?: string;
  
  // Legacy format
  invoices?: Array<{
    invoiceId: string;
    extractedData?: ParsedInvoiceData;
    status: 'success' | 'failed';
    errorMessage?: string;
    confidence?: number;
  }>;
  timestamp?: string;
  action?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("ocr-webhook function called");
    const payload: OCRWebhookPayload = await req.json();
    console.log("Received OCR results:", JSON.stringify(payload, null, 2));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Handle different payload formats
    let invoicesToProcess: Array<{
      invoiceId: string;
      parsedData?: ParsedInvoiceData;
      status: 'success' | 'failed';
      errorMessage?: string;
    }> = [];

    // Format 1: Array of parsed data from n8n Parse and Validate JSON (your case)
    if (payload.parsedData && Array.isArray(payload.parsedData)) {
      console.log("Processing n8n parsed data format");
      
      // For n8n format, we need to find invoices to update - try different statuses
      const { data: availableInvoices, error: fetchError } = await supabase
        .from('invoices')
        .select('*')
        .in('status', ['processing', 'new', 'queued']) // Try multiple statuses
        .order('created_at', { ascending: true });

      console.log("Available invoices found:", availableInvoices?.length || 0);
      console.log("Invoice statuses:", availableInvoices?.map(inv => ({ id: inv.id, status: inv.status, file_name: inv.file_name })));

      if (fetchError) {
        throw new Error(`Failed to fetch invoices: ${fetchError.message}`);
      }

      if (!availableInvoices || availableInvoices.length === 0) {
        throw new Error("No invoices found to update with parsed data. Please check if invoices exist in the database.");
      }

      // Match parsed data to invoices (in order they were processed)
      payload.parsedData.forEach((parsedItem, index) => {
        if (availableInvoices[index]) {
          invoicesToProcess.push({
            invoiceId: availableInvoices[index].id,
            parsedData: parsedItem,
            status: 'success'
          });
        }
      });
    }
    // Format 2: Single invoice with ID provided
    else if (payload.invoice_id || payload.invoiceId) {
      const invoiceId = payload.invoice_id || payload.invoiceId;
      
      if (payload.parsed_data && Array.isArray(payload.parsed_data) && payload.parsed_data.length > 0) {
        invoicesToProcess.push({
          invoiceId: invoiceId,
          parsedData: payload.parsed_data[0],
          status: 'success'
        });
      } else {
        invoicesToProcess.push({
          invoiceId: invoiceId,
          status: 'failed',
          errorMessage: payload.error || 'No parsed data provided'
        });
      }
    }
    // Format 3: Legacy format
    else if (payload.invoices && Array.isArray(payload.invoices)) {
      invoicesToProcess = payload.invoices.map(inv => ({
        invoiceId: inv.invoiceId,
        parsedData: inv.extractedData,
        status: inv.status,
        errorMessage: inv.errorMessage
      }));
    }
    else {
      throw new Error("Invalid payload format: no recognizable data structure found");
    }

    const results = [];

    for (const invoice of invoicesToProcess) {
      console.log(`Processing OCR result for invoice ${invoice.invoiceId}`);
      
      try {
        // Prepare update data
        const updateData: any = {
          status: invoice.status,
          updated_at: new Date().toISOString(),
        };

        if (invoice.status === 'success' && invoice.parsedData) {
          updateData.extracted_data = invoice.parsedData;
          updateData.confidence_score = invoice.parsedData.confidence || 0.95; // Default from your example
          
          // Auto-approve logic based on confidence
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
          console.log(`Successfully updated invoice ${invoice.invoiceId} with confidence ${updateData.confidence_score}`);
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
      processed: invoicesToProcess.length,
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