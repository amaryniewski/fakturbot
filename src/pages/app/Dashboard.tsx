import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { InvoiceExtractedData } from "@/components/InvoiceExtractedData";
import { useGmailIntegration } from "@/hooks/useGmailIntegration";
import { SecurityAlert } from "@/components/SecurityAlert";
import { OCRDebugPanel } from "@/components/OCRDebugPanel";
import { Trash2 } from "lucide-react";

type Invoice = {
  id: string;
  file_name: string;
  sender_email: string;
  received_at: string;
  file_size: number | null;
  file_url: string | null;
  status: string;
  extracted_data?: any;
  needs_review?: boolean;
  confidence_score?: number;
  approved_at?: string;
  approved_by?: string;
};

type Item = {
  id: string;
  file: string;
  sender: string;
  date: string;
  size: string;
  status: "New" | "Queued" | "Processing" | "Success" | "Failed";
  fileUrl: string | null;
};

const formatFileSize = (bytes: number | null): string => {
  if (!bytes) return "Unknown";
  const kb = Math.round(bytes / 1024);
  return `${kb} KB`;
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const mapStatusToDisplay = (status: string): Item["status"] => {
  switch (status.toLowerCase()) {
    case 'new': return 'New';
    case 'queued': return 'Queued';
    case 'processing': return 'Processing';
    case 'success': return 'Success';
    case 'failed': return 'Failed';
    default: return 'New';
  }
};

const statusBadge = (s: Item["status"]) => {
  switch (s) {
    case "New":
      return <Badge variant="secondary">New</Badge>;
    case "Queued":
      return <Badge>Queued</Badge>;
    case "Processing":
      return <Badge>Processing</Badge>;
    case "Success":
      return <Badge className="bg-green-600 text-white hover:bg-green-600">Success</Badge>;
    case "Failed":
      return <Badge variant="destructive">Failed</Badge>;
  }
};

const Dashboard = () => {
  const { toast } = useToast();
  const { processGmailInvoices, loading: gmailLoading } = useGmailIntegration();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    // Default to 7 days ago
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => {
    // Default to today
    return new Date().toISOString().split('T')[0];
  });
  
  useEffect(() => { document.title = "FakturBot – Dashboard"; }, []);

  const fetchInvoices = async () => {
    try {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('User not authenticated');
        return;
      }

      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false });

      if (error) throw error;
      console.log('Fetched invoices:', data?.length);
      setInvoices(data || []);
    } catch (error: any) {
      console.error('Error fetching invoices:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się pobrać faktur",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const processGmailEmails = async () => {
    setProcessing(true);
    try {
      const result = await processGmailInvoices(fromDate, toDate);
      
      toast({
        title: "Sukces",
        description: `Przetworzono ${result.processedInvoices} nowych faktur z Gmail. OCR zostanie uruchomiony automatycznie.`,
      });

      // OCR notifications are now handled by real-time updates system
      
      fetchInvoices();
    } catch (error: any) {
      // Error handling is done in the hook
    } finally {
      setProcessing(false);
    }
  };

  const deleteSelected = async () => {
    if (selected.length === 0) return;
    
    try {
      // Delete from database
      const { error } = await supabase
        .from('invoices')
        .delete()
        .in('id', selected);

      if (error) throw error;

      toast({
        title: "Usunięto",
        description: `Usunięto ${selected.length} faktur`,
      });

      setSelected([]);
      fetchInvoices();
    } catch (error: any) {
      console.error('Error deleting invoices:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się usunąć faktur",
        variant: "destructive",
      });
    }
  };

  const approveSelected = async () => {
    console.log("approveSelected called with selected:", selected);
    if (selected.length === 0) return;
    
    try {
      // First, update the database to mark as approved
      const { error } = await supabase
        .from('invoices')
        .update({ 
          needs_review: false,
          approved_at: new Date().toISOString(),
          approved_by: (await supabase.auth.getUser()).data.user?.id
        })
        .in('id', selected);

      if (error) throw error;

      // Start OCR processing for approved invoices using Supabase functions
      console.log("Starting OCR processing for approved invoices...");
      
      try {
        // Get the invoices that were just approved to start OCR
        const { data: approvedInvoices, error: fetchError } = await supabase
          .from('invoices')
          .select('id, file_url, status')
          .in('id', selected);

        if (fetchError) throw fetchError;

        // Start OCR processing for each invoice - simplified approach
        const ocrPromises = approvedInvoices?.map(async (invoice) => {
          try {
            // Only start OCR if not already processed
            if (invoice.status === 'new' || invoice.status === 'failed') {
              console.log(`Starting OCR for invoice ${invoice.id}: ${invoice.file_url}`);
              
              // Use only OCR.space (it's working) and update invoice directly
              const { data: ocrResult, error: ocrError } = await supabase.functions.invoke('ocr-space', {
                body: { 
                  invoiceId: invoice.id,
                  invoiceUrl: invoice.file_url 
                }
              });
              
              if (ocrError) {
                console.error(`OCR failed for invoice ${invoice.id}:`, ocrError);
              } else {
                console.log(`OCR completed for invoice ${invoice.id}:`, ocrResult);
                
                // Wait a moment and trigger comparison
                setTimeout(async () => {
                  try {
                    await supabase.functions.invoke('ocr-compare', {
                      body: { invoiceId: invoice.id }
                    });
                    console.log(`OCR comparison triggered for invoice ${invoice.id}`);
                  } catch (compareError) {
                    console.error(`OCR comparison failed for invoice ${invoice.id}:`, compareError);
                  }
                }, 2000); // Wait 2 seconds
              }
            }
          } catch (ocrError) {
            console.error(`OCR processing failed for invoice ${invoice.id}:`, ocrError);
          }
        }) || [];

        // Wait for all OCR processing to start
        await Promise.allSettled(ocrPromises);

        toast({
          title: "Zatwierdzono!",
          description: `${selected.length} faktur zostało zatwierdzonych i rozpoczęto przetwarzanie OCR.`,
        });

      } catch (ocrError: any) {
        console.error('OCR processing error:', ocrError);
        toast({
          title: "Ostrzeżenie", 
          description: `Faktury zatwierdzono, ale wystąpił problem z uruchomieniem OCR.`,
          variant: "destructive",
        });
      }

      setSelected([]);
      fetchInvoices();
    } catch (error: any) {
      console.error('Error approving invoices:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się zatwierdzić faktur",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchInvoices();

    // Real-time subscription for invoice status changes
    const channel = supabase
      .channel('dashboard-invoice-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invoices'
        },
        (payload) => {
          console.log('Invoice change detected:', payload);
          
          // Show toast notifications for status changes
          if (payload.eventType === 'UPDATE' && payload.old?.status !== payload.new?.status) {
            const fileName = payload.new.file_name;
            const newStatus = payload.new.status;
            
            switch (newStatus) {
              case 'processing':
                toast({
                  title: "Przetwarzanie rozpoczęte",
                  description: `Faktura ${fileName} jest teraz przetwarzana`,
                });
                break;
              case 'success':
                toast({
                  title: "Przetwarzanie zakończone",
                  description: `Faktura ${fileName} została pomyślnie przetworzona`,
                });
                break;
              case 'failed':
                toast({
                  title: "Błąd przetwarzania",
                  description: `Faktura ${fileName} nie mogła zostać przetworzona`,
                  variant: "destructive",
                });
                break;
            }
          }
          
          // Refresh the invoice list
          fetchInvoices();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Convert invoices to display format
  const data: Item[] = invoices.map(invoice => ({
    id: invoice.id,
    file: invoice.file_name,
    sender: invoice.sender_email,
    date: formatDate(invoice.received_at),
    size: formatFileSize(invoice.file_size),
    status: mapStatusToDisplay(invoice.status),
    fileUrl: invoice.file_url
  }));

  const allSelected = selected.length === data.length;

  const onToggleAll = (checked: boolean | string) => {
    setSelected(checked ? data.map((d) => d.id) : []);
  };

  const onToggle = (id: string, checked: boolean | string) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        console.log("Toggle preview");
        e.preventDefault();
      }
      if (e.code === "ArrowDown" || e.code === "ArrowUp") {
        console.log("Navigate list with arrows");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectedItem = useMemo(() => data.find((d) => d.id === previewId) ?? null, [previewId]);

  return (
    <div className="space-y-4">
      <SecurityAlert />
      <section className="grid grid-cols-1 xl:grid-cols-[1fr_1.5fr] gap-4 h-[calc(100vh-120px)]">
      <article className="rounded-lg border bg-card shadow overflow-hidden flex flex-col max-h-full">
        {/* Date filter and controls at the top */}
        <div className="border-b bg-card p-3 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="topFromDate" className="text-sm whitespace-nowrap">Od:</Label>
              <Input
                id="topFromDate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-auto text-sm"
              />
              <Label htmlFor="topToDate" className="text-sm whitespace-nowrap">Do:</Label>
              <Input
                id="topToDate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-auto text-sm"
              />
              <Button variant="outline" onClick={processGmailEmails} disabled={processing || gmailLoading} size="sm">
                {processing || gmailLoading ? "Przetwarzanie..." : "Sprawdź Gmail"}
              </Button>
              <Button variant="outline" onClick={fetchInvoices} disabled={loading} size="sm">
                {loading ? "Loading..." : "Refresh"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Showing {data.length} invoices</p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button 
              variant="outline" 
              disabled={selected.length === 0} 
              onClick={deleteSelected}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Usuń wybrane ({selected.length})
            </Button>
            <Button disabled={selected.length === 0} onClick={approveSelected}>
              Zatwierdź wybrane ({selected.length})
            </Button>
          </div>
        </div>
        <div className="overflow-auto flex-1 min-h-0">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all" />
                </TableHead>
                <TableHead>File</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading invoices...
                  </TableCell>
                </TableRow>
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    <div className="py-8">
                      <p className="mb-4">Brak faktur z emaili. Połącz Gmail i rozpocznij automatyczne przetwarzanie.</p>
                      <div className="flex items-center gap-2 mb-4">
                        <Label htmlFor="emptyFromDate" className="text-sm">Od:</Label>
                        <Input
                          id="emptyFromDate"
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="w-auto text-sm"
                        />
                        <Label htmlFor="emptyToDate" className="text-sm">Do:</Label>
                        <Input
                          id="emptyToDate"
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="w-auto text-sm"
                        />
                      </div>
                      <Button 
                        onClick={processGmailEmails} 
                        disabled={processing || gmailLoading}
                        className="mx-auto"
                      >
                        {processing || gmailLoading ? "Przetwarzanie..." : "Sprawdź Gmail"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer" onClick={() => setPreviewId(row.id)}>
                    <TableCell>
                      <Checkbox checked={selected.includes(row.id)} onCheckedChange={(v) => onToggle(row.id, v!)} aria-label={`Select ${row.file}`} />
                    </TableCell>
                    <TableCell className="font-medium">{row.file}</TableCell>
                    <TableCell>{row.sender}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>{row.size}</TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </article>

      <aside className="rounded-lg border bg-card shadow min-h-[400px] flex flex-col">
        {!selectedItem ? (
          <div className="flex-1 grid place-items-center text-center p-8 text-muted-foreground">
            <div>
              <div className="h-24 w-24 rounded-2xl bg-muted mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-1">Select an invoice to preview</h2>
              <p className="text-sm">Click on any invoice from the list to view its contents and metadata here.</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="h-12 border-b px-4 flex items-center justify-between text-sm">
              <span>{selectedItem.file}</span>
              {invoices.find(i => i.id === selectedItem.id)?.needs_review && (
                <Badge variant="secondary">Wymaga przeglądu</Badge>
              )}
            </div>
            
            {/* Show extracted data if available */}
            {(() => {
              const invoice = invoices.find(i => i.id === selectedItem.id);
              return invoice?.extracted_data ? (
                <InvoiceExtractedData 
                  data={invoice.extracted_data}
                  confidenceScore={invoice.confidence_score}
                />
              ) : null;
            })()}
            
            <iframe 
              title="PDF preview" 
              src={selectedItem.fileUrl || ""} 
              className="flex-1 w-full border-0" 
              style={{ minHeight: '500px' }}
              onError={(e) => {
                console.error('PDF preview error:', e);
              }}
            />
          </div>
        )}
      </aside>
      </section>
      <OCRDebugPanel />
    </div>
  );
};

export default Dashboard;
