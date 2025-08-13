import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FailedInvoice {
  id: string;
  file_name: string;
  sender_email: string;
  received_at: string;
  file_size: number | null;
  error_message: string | null;
  status: string;
}

const Failed = () => {
  const [invoices, setInvoices] = useState<FailedInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFailedInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, file_name, sender_email, received_at, file_size, error_message, status')
        .eq('status', 'failed')
        .order('received_at', { ascending: false });

      if (error) {
        console.error('Error fetching failed invoices:', error);
        toast({
          title: "Błąd",
          description: "Nie udało się pobrać listy nieudanych faktur",
          variant: "destructive",
        });
        return;
      }

      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching failed invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const retryInvoice = async (invoiceId: string) => {
    try {
      const { error } = await supabase
        .from('invoices')
        .update({ 
          status: 'queued',
          error_message: null
        })
        .eq('id', invoiceId);

      if (error) throw error;

      toast({
        title: "Sukces",
        description: "Faktura została dodana ponownie do kolejki",
      });
      
      fetchFailedInvoices();
    } catch (error) {
      console.error('Error retrying invoice:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się ponownie przetworzyć faktury",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchFailedInvoices();

    // Real-time subscription
    const channel = supabase
      .channel('failed-invoices-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: 'status=eq.failed'
        },
        () => {
          fetchFailedInvoices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "—";
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('pl-PL');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Nieudane faktury</h1>
          <p className="text-muted-foreground">
            Faktury, które nie mogły zostać przetworzone
          </p>
        </div>
        <Button onClick={fetchFailedInvoices} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Odśwież
        </Button>
      </div>

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">Brak nieudanych faktur</CardTitle>
            <CardDescription>
              Wszystkie faktury zostały pomyślnie przetworzone
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Faktury wymagające uwagi</CardTitle>
            <CardDescription>
              {invoices.length} {invoices.length === 1 ? 'faktura wymaga' : 'faktury wymagają'} ponownego przetworzenia
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plik</TableHead>
                  <TableHead>Nadawca</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Rozmiar</TableHead>
                  <TableHead>Błąd</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.file_name}
                    </TableCell>
                    <TableCell>{invoice.sender_email}</TableCell>
                    <TableCell>{formatDate(invoice.received_at)}</TableCell>
                    <TableCell>{formatFileSize(invoice.file_size)}</TableCell>
                    <TableCell>
                      <div className="max-w-xs">
                        <p className="text-sm text-destructive truncate" title={invoice.error_message || ''}>
                          {invoice.error_message || 'Nieznany błąd'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => retryInvoice(invoice.id)}
                        variant="outline"
                        size="sm"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Ponów
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Failed;