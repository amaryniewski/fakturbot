import { useState } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface N8nOCRResult {
  extractedData: any;
  structuredData?: {
    vendor_name?: string;
    vendor_nip?: string;
    buyer_name?: string;
    buyer_nip?: string;
    total_net?: number;
    total_vat?: number;
    total_gross?: number;
    items?: Array<{
      item_name: string;
      quantity?: number;
      unit_price?: number;
      net_amount?: number;
      vat_rate?: number;
      vat_amount?: number;
      gross_amount?: number;
    }>;
  };
}

export const useN8nIntegration = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const processInvoiceWithN8n = async (invoiceId: string, invoiceUrl: string): Promise<N8nOCRResult | null> => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        throw new Error('User not authenticated');
      }

      console.log('Starting n8n OCR processing for invoice:', invoiceId);
      
      const { data, error } = await supabase.functions.invoke('n8n-ocr-processor', {
        body: {
          invoiceId,
          invoiceUrl,
          userId: userData.user.id
        }
      });

      if (error) {
        console.error('n8n OCR processing error:', error);
        toast({
          title: "OCR Processing Failed",
          description: "Failed to process invoice with n8n OCR",
          variant: "destructive",
        });
        return null;
      }

      console.log('n8n OCR processing completed:', data);
      
      toast({
        title: "OCR Processing Complete",
        description: "Invoice processed successfully with n8n OCR",
      });

      return data as N8nOCRResult;
    } catch (error) {
      console.error('Error in n8n OCR processing:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const processInvoiceFile = async (file: File): Promise<N8nOCRResult | null> => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        throw new Error('User not authenticated');
      }

      // Upload file to storage first
      const fileName = `${userData.user.id}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`File upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('invoices')
        .getPublicUrl(fileName);

      // Create invoice record
      const { data: invoiceRecord, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          user_id: userData.user.id,
          sender_email: 'manual-upload',
          subject: `Manual upload: ${file.name}`,
          received_at: new Date().toISOString(),
          file_name: file.name,
          file_size: file.size,
          file_url: publicUrl,
          status: 'new',
          needs_review: true
        })
        .select('id')
        .single();

      if (invoiceError) {
        throw new Error(`Invoice creation failed: ${invoiceError.message}`);
      }

      // Process with n8n
      return await processInvoiceWithN8n(invoiceRecord.id, publicUrl);
    } catch (error) {
      console.error('Error processing invoice file:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    processInvoiceWithN8n,
    processInvoiceFile
  };
};