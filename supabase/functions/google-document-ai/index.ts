import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GoogleCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface DocumentAIEntity {
  type?: string;
  mentionText?: string;
  confidence?: number;
  normalizedValue?: {
    text?: string;
    moneyValue?: {
      currencyCode?: string;
      units?: string;
      nanos?: number;
    };
    dateValue?: {
      year?: number;
      month?: number;
      day?: number;
    };
  };
}

interface DocumentAIResponse {
  document?: {
    text?: string;
    entities?: DocumentAIEntity[];
  };
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

async function generateGoogleJWT(credentials: GoogleCredentials): Promise<string> {
  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const headerB64 = btoa(JSON.stringify(header)).replace(/[+\/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m] || m));
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/[+\/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m] || m));
  
  const message = `${headerB64}.${payloadB64}`;
  
  // Import private key for signing
  const privateKey = credentials.private_key.replace(/\\n/g, '\n');
  const key = await crypto.subtle.importKey(
    "pkcs8",
    new TextEncoder().encode(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(message)
  );
  
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/[+\/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m] || m));
  
  return `${message}.${signatureB64}`;
}

async function getAccessToken(credentials: GoogleCredentials): Promise<string> {
  const jwt = await generateGoogleJWT(credentials);
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

async function processWithDocumentAI(fileUrl: string, accessToken: string, projectId: string, processorId: string, location: string): Promise<DocumentAIResponse> {
  // Download file and convert to base64
  const fileResponse = await fetch(fileUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download file: ${fileResponse.status}`);
  }
  
  const fileBuffer = await fileResponse.arrayBuffer();
  const base64Content = btoa(String.fromCharCode(...new Uint8Array(fileBuffer)));
  
  const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`;
  
  const requestBody = {
    rawDocument: {
      content: base64Content,
      mimeType: 'application/pdf'
    }
  };
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Document AI API error: ${response.status} - ${errorText}`);
  }
  
  return await response.json();
}

function extractInvoiceDataFromDocumentAI(response: DocumentAIResponse): { data: InvoiceData; confidence: number } {
  const data: InvoiceData = {};
  const entities = response.document?.entities || [];
  
  let totalEntities = 0;
  let confidenceSum = 0;
  
  for (const entity of entities) {
    if (!entity.type || !entity.confidence) continue;
    
    totalEntities++;
    confidenceSum += entity.confidence;
    
    switch (entity.type.toLowerCase()) {
      case 'supplier_name':
      case 'vendor_name':
        data.vendorName = entity.mentionText || entity.normalizedValue?.text;
        break;
        
      case 'invoice_id':
      case 'invoice_number':
        data.invoiceNumber = entity.mentionText || entity.normalizedValue?.text;
        break;
        
      case 'invoice_date':
        if (entity.normalizedValue?.dateValue) {
          const date = entity.normalizedValue.dateValue;
          data.invoiceDate = `${date.day}/${date.month}/${date.year}`;
        } else {
          data.invoiceDate = entity.mentionText;
        }
        break;
        
      case 'due_date':
        if (entity.normalizedValue?.dateValue) {
          const date = entity.normalizedValue.dateValue;
          data.dueDate = `${date.day}/${date.month}/${date.year}`;
        } else {
          data.dueDate = entity.mentionText;
        }
        break;
        
      case 'total_amount':
      case 'total_price':
        if (entity.normalizedValue?.moneyValue) {
          const money = entity.normalizedValue.moneyValue;
          data.totalAmount = parseFloat(money.units || '0') + (money.nanos || 0) / 1000000000;
          data.currency = money.currencyCode;
        }
        break;
        
      case 'vat_amount':
      case 'tax_amount':
        if (entity.normalizedValue?.moneyValue) {
          const money = entity.normalizedValue.moneyValue;
          data.vatAmount = parseFloat(money.units || '0') + (money.nanos || 0) / 1000000000;
        }
        break;
        
      case 'net_amount':
      case 'subtotal':
        if (entity.normalizedValue?.moneyValue) {
          const money = entity.normalizedValue.moneyValue;
          data.netAmount = parseFloat(money.units || '0') + (money.nanos || 0) / 1000000000;
        }
        break;
        
      case 'supplier_tax_id':
      case 'vendor_vat_id':
        data.vendorVatId = entity.mentionText || entity.normalizedValue?.text;
        break;
        
      case 'supplier_address':
      case 'vendor_address':
        data.vendorAddress = entity.mentionText || entity.normalizedValue?.text;
        break;
    }
  }
  
  const overallConfidence = totalEntities > 0 ? confidenceSum / totalEntities : 0;
  return { data, confidence: overallConfidence };
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

    console.log(`Processing Google Document AI for invoice: ${invoiceId}`);
    const startTime = Date.now();

    // Get configuration
    const credentialsJson = Deno.env.get('GOOGLE_DOCUMENT_AI_CREDENTIALS');
    const projectId = Deno.env.get('GOOGLE_DOCUMENT_AI_PROJECT_ID');
    const processorId = Deno.env.get('GOOGLE_DOCUMENT_AI_PROCESSOR_ID');
    const location = Deno.env.get('GOOGLE_DOCUMENT_AI_LOCATION') || 'eu';

    if (!credentialsJson || !projectId || !processorId) {
      throw new Error('Missing Google Document AI configuration');
    }

    const credentials: GoogleCredentials = JSON.parse(credentialsJson);

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

    // Get access token and process document
    const accessToken = await getAccessToken(credentials);
    const aiResponse = await processWithDocumentAI(invoice.file_url, accessToken, projectId, processorId, location);
    
    const { data: extractedData, confidence } = extractInvoiceDataFromDocumentAI(aiResponse);
    const processingTime = Date.now() - startTime;

    // Save OCR result
    const { data: ocrResult, error: ocrError } = await supabase
      .from('ocr_results')
      .insert({
        invoice_id: invoiceId,
        provider: 'google_document_ai',
        raw_text: aiResponse.document?.text || '',
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

    console.log(`Google Document AI completed for invoice ${invoiceId} with confidence ${confidence}`);

    return new Response(
      JSON.stringify({
        success: true,
        provider: 'google_document_ai',
        confidence: confidence,
        extractedData,
        processingTime,
        resultId: ocrResult.id
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Google Document AI processing error:', error);
    
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
            provider: 'google_document_ai',
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
        provider: 'google_document_ai'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});