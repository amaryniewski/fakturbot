import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Item = {
  id: string;
  file: string;
  sender: string;
  date: string;
  size: string;
  status: "New" | "Queued" | "Processing" | "Success" | "Failed";
};

const data: Item[] = [
  { id: "1", file: "2025-02-15_ACME.pdf", sender: "invoices@acme.com", date: "15 Feb 2025", size: "124 KB", status: "New" },
  { id: "2", file: "Invoice_2025_03_XYZ.pdf", sender: "billing@xyz-corp.com", date: "10 Feb 2025", size: "256 KB", status: "Queued" },
  { id: "3", file: "Utilities_Jan2025.pdf", sender: "support@utilities.co", date: "05 Feb 2025", size: "198 KB", status: "Processing" },
  { id: "4", file: "Internet_Service_Feb.pdf", sender: "billing@isp.net", date: "02 Feb 2025", size: "145 KB", status: "Success" },
  { id: "5", file: "Office_Supplies_Jan.pdf", sender: "orders@supplies.com", date: "28 Jan 2025", size: "312 KB", status: "Failed" },
];

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
  useEffect(() => { document.title = "FakturBot – Dashboard"; }, []);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
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
              {data.map((row) => (
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
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="sticky bottom-0 border-t bg-card/90 backdrop-blur p-3 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Showing {data.length} invoices (Company: ACME Company)</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => console.log("Refresh")}>Refresh</Button>
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
