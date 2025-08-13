import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RefreshCw, History as HistoryIcon, Download, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ProcessedInvoice {
  id: string;
  file_name: string;
  sender_email: string;
  received_at: string;
  file_size: number | null;
  status: string;
  approved_at: string | null;
  extracted_data: any;
  confidence_score: number | null;
}

const History = () => {
  const [invoices, setInvoices] = useState<ProcessedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredInvoices, setFilteredInvoices] = useState<ProcessedInvoice[]>([]);

  const fetchProcessedInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, file_name, sender_email, received_at, file_size, status, approved_at, extracted_data, confidence_score')
        .eq('status', 'success')
        .order('approved_at', { ascending: false });

      if (error) {
        console.error('Error fetching processed invoices:', error);
        toast({
          title: "Błąd",
          description: "Nie udało się pobrać historii faktur",
          variant: "destructive",
        });
        return;
      }

      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching processed invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCsv = () => {
    const csvData = filteredInvoices.map(invoice => ({
      'Nazwa pliku': invoice.file_name,
      'Nadawca': invoice.sender_email,
      'Data otrzymania': formatDate(invoice.received_at),
      'Data przetworzenia': invoice.approved_at ? formatDate(invoice.approved_at) : '—',
      'Rozmiar': formatFileSize(invoice.file_size),
      'Status': invoice.status,
      'Pewność': invoice.confidence_score ? `${(invoice.confidence_score * 100).toFixed(1)}%` : '—',
      'Kwota': invoice.extracted_data?.amount || '—',
      'Waluta': invoice.extracted_data?.currency || '—',
      'Numer faktury': invoice.extracted_data?.invoiceNumber || '—'
    }));

    const csvContent = [
      Object.keys(csvData[0] || {}).join(','),
      ...csvData.map(row => Object.values(row).map(value => `"${value}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `faktury_historia_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Sukces",
      description: "Historia została wyeksportowana do pliku CSV",
    });
  };

  useEffect(() => {
    fetchProcessedInvoices();

    // Real-time subscription
    const channel = supabase
      .channel('history-invoices-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices',
          filter: 'status=eq.success'
        },
        () => {
          fetchProcessedInvoices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const filtered = invoices.filter(invoice =>
      invoice.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.sender_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (invoice.extracted_data?.vendorName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (invoice.extracted_data?.invoiceNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredInvoices(filtered);
  }, [invoices, searchTerm]);

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return "—";
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('pl-PL');
  };

  const formatCurrency = (amount: number | null, currency: string | null): string => {
    if (!amount) return "—";
    return `${amount.toFixed(2)} ${currency || 'PLN'}`;
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
          <h1 className="text-2xl font-bold">Historia faktur</h1>
          <p className="text-muted-foreground">
            Faktury które zostały pomyślnie przetworzone
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToCsv} variant="outline" size="sm" disabled={filteredInvoices.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Eksportuj CSV
          </Button>
          <Button onClick={fetchProcessedInvoices} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Odśwież
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj faktur..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <HistoryIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">
              {searchTerm ? "Brak wyników wyszukiwania" : "Brak przetworzonych faktur"}
            </CardTitle>
            <CardDescription>
              {searchTerm 
                ? "Spróbuj innych słów kluczowych"
                : "Przetworzone faktury pojawią się tutaj"
              }
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Przetworzone faktury</CardTitle>
            <CardDescription>
              {filteredInvoices.length} z {invoices.length} faktur
              {searchTerm && ` (filtrowane)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plik</TableHead>
                  <TableHead>Nadawca</TableHead>
                  <TableHead>Data otrzymania</TableHead>
                  <TableHead>Data przetworzenia</TableHead>
                  <TableHead>Kwota</TableHead>
                  <TableHead>Numer faktury</TableHead>
                  <TableHead>Pewność</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.file_name}
                    </TableCell>
                    <TableCell>{invoice.sender_email}</TableCell>
                    <TableCell>{formatDate(invoice.received_at)}</TableCell>
                    <TableCell>
                      {invoice.approved_at ? formatDate(invoice.approved_at) : '—'}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(invoice.extracted_data?.amount, invoice.extracted_data?.currency)}
                    </TableCell>
                    <TableCell>
                      {invoice.extracted_data?.invoiceNumber || '—'}
                    </TableCell>
                    <TableCell>
                      {invoice.confidence_score ? (
                        <Badge variant={invoice.confidence_score > 0.8 ? "default" : "secondary"}>
                          {(invoice.confidence_score * 100).toFixed(1)}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">
                        {invoice.status}
                      </Badge>
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

export default History;