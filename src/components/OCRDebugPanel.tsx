import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Eye, EyeOff } from "lucide-react";

interface OCRResult {
  id: string;
  invoice_id: string;
  provider: string;
  success: boolean;
  error_message: string | null;
  confidence_score: number | null;
  created_at: string;
  processing_time_ms: number | null;
}

interface Invoice {
  id: string;
  file_name: string;
  status: string;
  updated_at: string;
}

export function OCRDebugPanel() {
  const [isVisible, setIsVisible] = useState(false);
  const [ocrResults, setOcrResults] = useState<OCRResult[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch recent OCR results
      const { data: ocrData, error: ocrError } = await supabase
        .from('ocr_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (ocrError) throw ocrError;

      // Fetch recent invoice updates
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, file_name, status, updated_at')
        .order('updated_at', { ascending: false })
        .limit(10);

      if (invoiceError) throw invoiceError;

      setOcrResults(ocrData || []);
      setRecentInvoices(invoiceData || []);
    } catch (error: any) {
      console.error('Error fetching debug data:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się pobrać danych debug",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerManualOCR = async (invoiceId: string) => {
    try {
      const invoice = recentInvoices.find(i => i.id === invoiceId);
      if (!invoice) return;

      toast({
        title: "OCR uruchomiony",
        description: `Rozpoczęto OCR dla ${invoice.file_name}`,
      });

      // Get full invoice data
      const { data: fullInvoice, error } = await supabase
        .from('invoices')
        .select('file_url')
        .eq('id', invoiceId)
        .single();

      if (error) throw error;

      // Use n8n OCR processor instead of old functions
      const { data: ocrResult, error: ocrError } = await supabase.functions.invoke('n8n-ocr-processor', {
        body: { 
          invoiceId: invoiceId,
          invoiceUrl: fullInvoice.file_url,
          userId: (await supabase.auth.getUser()).data.user?.id
        }
      });

      if (ocrError) {
        throw ocrError;
      }

      console.log(`Manual n8n OCR processing completed for ${invoiceId}:`, ocrResult);
      fetchData(); // Refresh data immediately

    } catch (error: any) {
      console.error('Manual OCR error:', error);
      toast({
        title: "Błąd OCR",
        description: error.message || "Nie udało się uruchomić OCR",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (isVisible) {
      fetchData();
    }
  }, [isVisible]);

  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 z-50"
      >
        <Eye className="h-4 w-4 mr-2" />
        OCR Debug
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 max-h-96 z-50 shadow-lg">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">OCR Debug Panel</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsVisible(false)}>
              <EyeOff className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 overflow-auto max-h-80">
        <div className="space-y-3">
          <div>
            <h4 className="text-xs font-medium mb-2">Recent OCR Results</h4>
            <div className="space-y-1">
              {ocrResults.map((result) => (
                <div key={result.id} className="text-xs border rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant={result.success ? "default" : "destructive"} className="text-xs">
                      {result.provider}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(result.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    ID: {result.invoice_id.slice(0, 8)}...
                  </div>
                  {result.confidence_score && (
                    <div className="text-muted-foreground">
                      Confidence: {(result.confidence_score * 100).toFixed(1)}%
                    </div>
                  )}
                  {result.error_message && (
                    <div className="text-red-500 text-xs mt-1">
                      Error: {result.error_message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-medium mb-2">Recent Invoices</h4>
            <div className="space-y-1">
              {recentInvoices.slice(0, 5).map((invoice) => (
                <div key={invoice.id} className="text-xs border rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-xs">
                      {invoice.status}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-5 px-2 text-xs"
                      onClick={() => triggerManualOCR(invoice.id)}
                    >
                      Run OCR
                    </Button>
                  </div>
                  <div className="text-muted-foreground truncate">
                    {invoice.file_name}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(invoice.updated_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}