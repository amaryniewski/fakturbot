import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Invoice = {
  id: string;
  file_name: string;
  sender_email: string;
  received_at: string;
  file_size: number | null;
  status: string;
};

type Item = {
  id: string;
  file: string;
  sender: string;
  date: string;
  size: string;
  status: "New" | "Queued" | "Processing" | "Success" | "Failed";
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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  
  useEffect(() => { document.title = "FakturBot – Dashboard"; }, []);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('received_at', { ascending: false });

      if (error) throw error;
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

  useEffect(() => {
    fetchInvoices();
  }, []);

  // Convert invoices to display format
  const data: Item[] = invoices.map(invoice => ({
    id: invoice.id,
    file: invoice.file_name,
    sender: invoice.sender_email,
    date: formatDate(invoice.received_at),
    size: formatFileSize(invoice.file_size),
    status: mapStatusToDisplay(invoice.status)
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
    <section className="grid grid-cols-1 xl:grid-cols-[1fr_1.5fr] gap-4">
      <article className="rounded-lg border bg-card shadow overflow-hidden flex flex-col">
        <div className="overflow-auto">
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
                    No invoices found. Try syncing with Fakturownia in Settings.
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
        <div className="sticky bottom-0 border-t bg-card/90 backdrop-blur p-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Showing {data.length} invoices (Company: ACME Company)</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchInvoices} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </Button>
            <Button disabled={selected.length === 0} onClick={() => console.log("Approve", selected)}>Approve selected</Button>
          </div>
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
            <div className="h-12 border-b px-4 grid place-items-center text-sm">{selectedItem.file}</div>
            <iframe title="PDF preview" src="/sample.pdf" className="flex-1 w-full" />
          </div>
        )}
      </aside>
    </section>
  );
};

export default Dashboard;
