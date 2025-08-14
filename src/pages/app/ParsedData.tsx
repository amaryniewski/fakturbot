import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RefreshCw, Code, Search, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

interface ParsedInvoice {
  id: string;
  file_name: string;
  sender_email: string;
  received_at: string;
  status: string;
  extracted_data: any;
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
}

const ParsedData = () => {
  const [invoices, setInvoices] = useState<ParsedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredInvoices, setFilteredInvoices] = useState<ParsedInvoice[]>([]);

  const fetchParsedInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, file_name, sender_email, received_at, status, extracted_data, confidence_score, created_at, updated_at')
        .not('extracted_data', 'is', null)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Error fetching parsed invoices:', error);
        toast({
          title: "Błąd",
          description: "Nie udało się pobrać sparsowanych danych",
          variant: "destructive",
        });
        return;
      }

      setInvoices(data || []);
    } catch (error) {
      console.error('Error fetching parsed invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParsedInvoices();

    // Real-time subscription for extracted_data changes
    const channel = supabase
      .channel('parsed-data-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'invoices'
        },
        (payload) => {
          if (payload.new.extracted_data) {
            fetchParsedInvoices();
          }
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

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('pl-PL');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default">Sukces</Badge>;
      case 'processing':
        return <Badge variant="secondary">Przetwarzanie</Badge>;
      case 'failed':
        return <Badge variant="destructive">Błąd</Badge>;
      case 'queued':
        return <Badge variant="outline">W kolejce</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const renderExtractedDataPreview = (data: any) => {
    if (!data) return "—";
    
    const preview = [];
    if (data.vendorName) preview.push(`${data.vendorName}`);
    if (data.amount && data.currency) preview.push(`${data.amount} ${data.currency}`);
    if (data.invoiceNumber) preview.push(`#${data.invoiceNumber}`);
    
    return preview.join(" • ") || "Dane dostępne";
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
          <h1 className="text-2xl font-bold">Sparsowane dane</h1>
          <p className="text-muted-foreground">
            Dane wyodrębnione z faktur przez system OCR/AI
          </p>
        </div>
        <Button onClick={fetchParsedInvoices} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Odśwież
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj sparsowanych danych..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Code className="h-12 w-12 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">
              {searchTerm ? "Brak wyników wyszukiwania" : "Brak sparsowanych danych"}
            </CardTitle>
            <CardDescription>
              {searchTerm 
                ? "Spróbuj innych słów kluczowych"
                : "Sparsowane dane z faktur pojawią się tutaj"
              }
            </CardDescription>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dane z faktur</CardTitle>
            <CardDescription>
              {filteredInvoices.length} z {invoices.length} faktur zawiera sparsowane dane
              {searchTerm && ` (filtrowane)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plik</TableHead>
                  <TableHead>Nadawca</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Podgląd danych</TableHead>
                  <TableHead>Pewność</TableHead>
                  <TableHead>Ostatnia aktualizacja</TableHead>
                  <TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.file_name}
                    </TableCell>
                    <TableCell>{invoice.sender_email}</TableCell>
                    <TableCell>
                      {getStatusBadge(invoice.status)}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="truncate">
                        {renderExtractedDataPreview(invoice.extracted_data)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {invoice.confidence_score ? (
                        <Badge variant={invoice.confidence_score > 0.8 ? "default" : "secondary"}>
                          {(invoice.confidence_score * 100).toFixed(1)}%
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>{formatDate(invoice.updated_at)}</TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-2" />
                            Zobacz
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Sparsowane dane: {invoice.file_name}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <strong>Status:</strong> {getStatusBadge(invoice.status)}
                              </div>
                              <div>
                                <strong>Pewność:</strong> {invoice.confidence_score ? `${(invoice.confidence_score * 100).toFixed(1)}%` : '—'}
                              </div>
                              <div>
                                <strong>Utworzono:</strong> {formatDate(invoice.created_at)}
                              </div>
                              <div>
                                <strong>Zaktualizowano:</strong> {formatDate(invoice.updated_at)}
                              </div>
                            </div>
                            <div>
                              <strong className="text-sm">Sparsowane dane (JSON):</strong>
                              <pre className="mt-2 p-4 bg-muted rounded-md text-xs overflow-x-auto">
                                {JSON.stringify(invoice.extracted_data, null, 2)}
                              </pre>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
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

export default ParsedData;