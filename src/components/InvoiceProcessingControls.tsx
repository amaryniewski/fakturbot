import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useGmailIntegration } from "@/hooks/useGmailIntegration";
import { Calendar, RefreshCw } from "lucide-react";

export const InvoiceProcessingControls = () => {
  const { processGmailInvoices, loading } = useGmailIntegration();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const handleProcess = async () => {
    await processGmailInvoices(fromDate || undefined, toDate || undefined);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Przetwarzanie faktur
        </CardTitle>
        <CardDescription>
          Pobierz faktury z Gmail w określonym okresie
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="from-date">Data od</Label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to-date">Data do</Label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

        <Button 
          onClick={handleProcess} 
          disabled={loading}
          className="w-full flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? "Przetwarzanie..." : "Pobierz faktury"}
        </Button>
      </CardContent>
    </Card>
  );
};