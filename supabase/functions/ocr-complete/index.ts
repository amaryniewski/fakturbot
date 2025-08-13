import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceData {
  vendorName: string;
  vendorNIP: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  confidence: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("OCR Complete function called");
    const { invoices } = await req.json();
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const results = [];

    for (const invoice of invoices) {
      try {
        console.log(`Processing invoice: ${invoice.id}`);

        // 1. Download file from storage
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('invoices')
          .download(invoice.file_path);

        if (downloadError) {
          throw new Error(`Failed to download file: ${downloadError.message}`);
        }

        // 2. Convert to base64 for OCR
        const arrayBuffer = await fileData.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        const dataUrl = `data:application/pdf;base64,${base64}`;

        // 3. Call OCR API
        const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            base64image: dataUrl,
            apikey: Deno.env.get('OCR_SPACE_API_KEY') ?? '',
            language: 'pol',
            OCREngine: '2'
          })
        });

        const ocrData = await ocrResponse.json();
        const ocrText = ocrData.ParsedResults?.[0]?.ParsedText || '';

        if (!ocrText) {
          throw new Error('No text extracted from OCR');
        }

        // 4. Parse with OpenAI
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{
              role: 'user',
              content: `Jesteś asystentem AI specjalizującym się w analizie faktur. Wydobądź dane i zwróć TYLKO surowy JSON bez formatowania ani backticków:

{
  "amount": number,
  "currency": "PLN",
  "invoiceNumber": "string", 
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD", 
  "vendorName": "string",
  "vendorNIP": "string",
  "confidence": 0.95
}

Tekst faktury: ${ocrText}`
            }],
            response_format: { type: "json_object" }
          })
        });

        const openaiData = await openaiResponse.json();
        const extractedData: InvoiceData = JSON.parse(openaiData.choices[0].message.content);

        // 5. Update invoice in database
        const { error: updateError } = await supabase
          .from('invoices')
          .update({
            status: 'success',
            extracted_data: extractedData,
            confidence_score: extractedData.confidence || 0.95,
            needs_review: (extractedData.confidence || 0.95) < 0.8,
            updated_at: new Date().toISOString(),
            ...(((extractedData.confidence || 0.95) >= 0.8) && { approved_at: new Date().toISOString() })
          })
          .eq('id', invoice.id);

        if (updateError) {
          throw new Error(`Failed to update invoice: ${updateError.message}`);
        }

        results.push({
          invoiceId: invoice.id,
          success: true,
          extractedData
        });

        console.log(`Successfully processed invoice ${invoice.id}`);

      } catch (error: any) {
        console.error(`Error processing invoice ${invoice.id}:`, error);
        
        // Update invoice with error status
        await supabase
          .from('invoices')
          .update({
            status: 'failed',
            error_message: error.message,
            needs_review: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', invoice.id);

        results.push({
          invoiceId: invoice.id,
          success: false,
          error: error.message
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      results
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("Error in ocr-complete function:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);