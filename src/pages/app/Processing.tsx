import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Filter } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ProcessingInvoice {
  id: string;
  file_name: string;
  sender_email: string;
  received_at: string;
  file_size: number | null;
  status: string;
  created_at: string;
  file_url?: string;
}

export default function Processing() {
  const [invoices, setInvoices] = useState<ProcessingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProcessingInvoices = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('status', 'processing')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching processing invoices:', error);
        toast({
          title: "Błąd",
          description: "Nie udało się pobrać faktur w przetwarzaniu",
          variant: "destructive",
        });
        return;
      }

      setInvoices(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Błąd",
        description: "Wystąpił nieoczekiwany błąd",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcessingInvoices();

    // Set up real-time subscription for processing status changes
    const channel = supabase
      .channel('processing-invoices')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: 'status=eq.processing'
        },
        () => {
          fetchProcessingInvoices();
        }
      )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'invoices'
          },
          (payload) => {
            // If an invoice status changed from processing to something else, refresh
            if ((payload as any).old?.status === 'processing') {
              fetchProcessingInvoices();
            }
          }
        )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "N/A";
    return `${Math.round(bytes / 1024)} KB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const estimatedProgress = useMemo(() => {
    // Simple progress estimation based on time elapsed since creation
    return invoices.map(invoice => {
      const createdAt = new Date(invoice.created_at);
      const now = new Date();
      const elapsedMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
      
      // Assume OCR takes about 2-5 minutes, so calculate progress accordingly
      const maxTime = 3; // 3 minutes estimated
      const progress = Math.min((elapsedMinutes / maxTime) * 100, 95); // Cap at 95% until actually complete
      
      return {
        ...invoice,
        progress: Math.max(10, progress) // Minimum 10% progress
      };
    });
  }, [invoices]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Processing</h1>
              <p className="text-muted-foreground">Faktury obecnie przetwarzane przez OCR</p>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Processing</h1>
          <p className="text-muted-foreground">Faktury obecnie przetwarzane przez OCR</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
          <Button onClick={fetchProcessingInvoices} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Odśwież
          </Button>
        </div>
      </div>

      {estimatedProgress.length === 0 ? (
        <div className="rounded-lg border bg-card p-8">
          <div className="text-center space-y-2">
            <div className="h-12 w-12 rounded-full bg-muted mx-auto flex items-center justify-center">
              <RefreshCw className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">Brak faktur w przetwarzaniu</h3>
            <p className="text-muted-foreground">
              Obecnie żadne faktury nie są przetwarzane przez OCR.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Postęp</TableHead>
                <TableHead>Plik</TableHead>
                <TableHead>Nadawca</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Rozmiar</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {estimatedProgress.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-muted/50">
                  <TableCell>
                    <div className="w-24">
                      <Progress value={invoice.progress} className="h-2" />
                      <span className="text-xs text-muted-foreground mt-1 block">
                        {Math.round(invoice.progress)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {invoice.file_name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.sender_email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(invoice.received_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatFileSize(invoice.file_size)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                      <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                      Processing
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          <div className="border-t bg-muted/30 px-6 py-3">
            <p className="text-sm text-muted-foreground">
              Wyświetlanych {estimatedProgress.length} faktur w przetwarzaniu
            </p>
          </div>
        </div>
      )}
    </div>
  );
}