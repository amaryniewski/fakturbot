// supabase/functions/ksef-fetch/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { KSeFClient } from '../_shared/ksef-client.ts';
import { KSeFXmlParser } from '../_shared/xml-parser.ts';
import { getKSeFApiUrl } from '../_shared/ksef-urls.ts';
import { decryptAesGcm, anonymizeForLogs, calculateSha256Hash } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface FetchRequest {
  connectionId: string;
  dateFrom?: string;
  dateTo?: string;
  subjectType?: 'subject1' | 'subject2' | 'subject3';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  let operationId: string | null = null;

  try {
    // POPRAWKA: Używamy SUPABASE_ANON_KEY + JWT użytkownika
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const { connectionId, dateFrom, dateTo, subjectType = 'subject1' }: FetchRequest = await req.json();

    if (!connectionId) {
      throw new Error('Missing connectionId');
    }

    console.log(`Starting KSeF fetch for user: ${anonymizeForLogs(user.id)}`);

    // Pobierz konfigurację
    const { data: config } = await supabaseClient
      .from('ksef_config')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();

    if (!config) {
      throw new Error('Configuration not found');
    }

    // Utwórz rekord operacji
    const { data: operation } = await supabaseClient
      .from('ksef_fetch_operations')
      .insert({
        user_id: user.id,
        operation_type: 'invoice_fetch',
        status: 'pending',
        request_data: { connectionId, dateFrom, dateTo, subjectType }
      })
      .select()
      .single();

    operationId = operation?.id;

    // Odszyfruj token
    const encryptionKey = Deno.env.get('KSEF_ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const decryptedToken = await decryptAesGcm(config.token_encrypted, encryptionKey);
    const baseUrl = getKSeFApiUrl(config.environment);

    // Inicjalizuj klienta KSeF
    const ksefClient = new KSeFClient({
      nip: config.nip,
      token: decryptedToken,
      baseUrl,
      sessionHeaderType: 'bearer',
      timeout: 60000
    });

    // Aktualizuj status operacji
    await supabaseClient
      .from('ksef_fetch_operations')
      .update({ 
        status: 'processing',
        operation_type: 'session_init'
      })
      .eq('id', operationId);

    // Inicjalizuj sesję
    console.log('Initializing KSeF session...');
    const session = await ksefClient.initSessionToken();

    await supabaseClient
      .from('ksef_fetch_operations')
      .update({ 
        session_id: session.sessionId,
        operation_type: 'query_start'
      })
      .eq('id', operationId);

    // Rozpocznij zapytanie
    console.log('Starting invoice query...');
    const queryId = await ksefClient.startInvoiceQuery(subjectType, dateFrom, dateTo);

    await supabaseClient
      .from('ksef_fetch_operations')
      .update({ 
        query_id: queryId,
        operation_type: 'query_status'
      })
      .eq('id', operationId);

    // Sprawdź status zapytania (z retry)
    let queryResult;
    let retries = 0;
    const maxRetries = 10;
    
    while (retries < maxRetries) {
      console.log(`Checking query status (attempt ${retries + 1})...`);
      queryResult = await ksefClient.checkQueryStatus(queryId);
      
      if (queryResult.items && queryResult.items.length > 0) {
        break;
      }
      
      retries++;
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 sekundy przerwy
      }
    }

    if (!queryResult.items || queryResult.items.length === 0) {
      console.log('No invoices found in the specified period');
      
      await supabaseClient
        .from('ksef_fetch_operations')
        .update({ 
          status: 'success',
          invoices_found: 0,
          invoices_processed: 0,
          invoices_new: 0,
          duplicates_found: 0,
          packages_count: 0,
          processing_time_ms: Date.now() - startTime,
          completed_at: new Date().toISOString()
        })
        .eq('id', operationId);

      await ksefClient.closeSession();

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            totalInvoices: 0,
            newInvoices: 0,
            duplicates: 0,
            packages: 0
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    await supabaseClient
      .from('ksef_fetch_operations')
      .update({ 
        operation_type: 'query_result',
        invoices_found: queryResult.totalItems || queryResult.items.length,
        packages_count: queryResult.items.length
      })
      .eq('id', operationId);

    // Pobierz i przetwórz pakiety
    const xmlParser = new KSeFXmlParser();
    let totalInvoices = 0;
    let newInvoices = 0;
    let duplicates = 0;

    for (const item of queryResult.items) {
      console.log(`Processing package ${item.partNumber}...`);
      
      try {
        // Pobierz pakiet ZIP
        const zipBuffer = await ksefClient.getQueryResult(queryId, item.partNumber);
        
        // Parsuj faktury z pakietu
        const invoices = await xmlParser.parseZipPackage(zipBuffer);
        totalInvoices += invoices.length;

        // Przetwórz każdą fakturę
        for (const invoice of invoices) {
          try {
            // Sprawdź czy faktura już istnieje
            const { data: existingInvoice } = await supabaseClient
              .from('ksef_invoice_registry')
              .select('id')
              .eq('user_id', user.id)
              .eq('ksef_element_reference_number', invoice.elementReferenceNumber)
              .single();

            if (existingInvoice) {
              duplicates++;
              console.log(`Duplicate invoice found: ${invoice.elementReferenceNumber}`);
              continue;
            }

            // Oblicz hash faktury
            const invoiceHash = await calculateSha256Hash(invoice.xmlContent);

            // Sprawdź duplikat po hash
            const { data: existingHash } = await supabaseClient
              .from('ksef_invoice_registry')
              .select('id')
              .eq('user_id', user.id)
              .eq('invoice_hash', invoiceHash)
              .single();

            if (existingHash) {
              duplicates++;
              console.log(`Duplicate invoice hash found: ${invoiceHash.slice(0, 8)}...`);
              continue;
            }

            // Dodaj do rejestru faktur
            const { data: registryEntry } = await supabaseClient
              .from('ksef_invoice_registry')
              .insert({
                user_id: user.id,
                ksef_element_reference_number: invoice.elementReferenceNumber,
                ksef_invoice_number: invoice.invoiceNumber,
                invoice_hash: invoiceHash,
                issue_date: invoice.issueDate,
                seller_nip: invoice.sellerNip,
                buyer_nip: invoice.buyerNip,
                total_amount: invoice.totalGross,
                currency: invoice.currency,
                status: 'fetched'
              })
              .select()
              .single();

            // Dodaj do głównej tabeli parsed_data
            const { data: parsedData } = await supabaseClient
              .from('parsed_data')
              .insert({
                user_id: user.id,
                source_type: 'ksef',
                invoice_number: invoice.invoiceNumber,
                issue_date: invoice.issueDate,
                seller_name: invoice.sellerName,
                buyer_name: invoice.buyerName,
                total_amount: invoice.totalGross,
                currency: invoice.currency,
                ksef_element_reference_number: invoice.elementReferenceNumber,
                ksef_original_xml: invoice.xmlContent,
                ksef_fetch_date: new Date().toISOString()
              })
              .select()
              .single();

            // Połącz rejestr z parsed_data
            if (registryEntry && parsedData) {
              await supabaseClient
                .from('ksef_invoice_registry')
                .update({ 
                  parsed_data_id: parsedData.id,
                  status: 'processed'
                })
                .eq('id', registryEntry.id);
            }

            newInvoices++;
            console.log(`Processed new invoice: ${invoice.invoiceNumber}`);

          } catch (error) {
            console.error(`Failed to process invoice ${invoice.elementReferenceNumber}:`, anonymizeForLogs(error));
            // Kontynuuj z następną fakturą
          }
        }

      } catch (error) {
        console.error(`Failed to process package ${item.partNumber}:`, anonymizeForLogs(error));
        // Kontynuuj z następnym pakietem
      }
    }

    // Zamknij sesję
    await ksefClient.closeSession();

    // Aktualizuj timestamp ostatniego pobierania
    await supabaseClient
      .from('ksef_config')
      .update({ 
        last_fetch_timestamp: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', connectionId);

    // Finalizuj operację
    await supabaseClient
      .from('ksef_fetch_operations')
      .update({ 
        status: 'success',
        invoices_processed: totalInvoices,
        invoices_new: newInvoices,
        duplicates_found: duplicates,
        processing_time_ms: Date.now() - startTime,
        completed_at: new Date().toISOString()
      })
      .eq('id', operationId);

    console.log(`KSeF fetch completed: ${newInvoices} new invoices, ${duplicates} duplicates`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          totalInvoices,
          newInvoices,
          duplicates,
          packages: queryResult.items.length
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('KSeF fetch failed:', anonymizeForLogs(error));
    
    // Aktualizuj status operacji w przypadku błędu
    if (operationId) {
      try {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        await supabaseClient
          .from('ksef_fetch_operations')
          .update({ 
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            processing_time_ms: Date.now() - startTime,
            completed_at: new Date().toISOString()
          })
          .eq('id', operationId);
      } catch (updateError) {
        console.error('Failed to update operation status:', updateError);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});