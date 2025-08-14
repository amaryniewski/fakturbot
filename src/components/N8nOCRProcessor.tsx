import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useN8nIntegration, type N8nOCRResult } from "@/hooks/useN8nIntegration";
import { Upload, FileText, Loader2 } from "lucide-react";

interface N8nOCRProcessorProps {
  onResult?: (result: N8nOCRResult) => void;
}

export const N8nOCRProcessor = ({ onResult }: N8nOCRProcessorProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const { loading, processInvoiceWithN8n, processInvoiceFile } = useN8nIntegration();

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    
    const result = await processInvoiceFile(selectedFile);
    if (result && onResult) {
      onResult(result);
    }
  };

  const handleUrlProcessing = async () => {
    if (!invoiceUrl) return;
    
    const result = await processInvoiceWithN8n(invoiceId || undefined, invoiceUrl);
    if (result && onResult) {
      onResult(result);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          n8n OCR Processor
        </CardTitle>
        <CardDescription>
          Process invoices using n8n workflows with advanced OCR capabilities
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Upload Section */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="file-upload">Upload PDF Invoice</Label>
            <div className="mt-2">
              <Input
                id="file-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
          </div>
          
          {selectedFile && (
            <div className="p-3 bg-muted rounded-lg flex items-center justify-between">
              <span className="text-sm font-medium">{selectedFile.name}</span>
              <Button
                onClick={handleFileUpload}
                disabled={loading}
                size="sm"
                className="ml-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Process
              </Button>
            </div>
          )}
        </div>

        {/* URL Processing Section */}
        <div className="space-y-4 pt-4 border-t">
          <div>
            <Label htmlFor="invoice-url">Invoice URL</Label>
            <Input
              id="invoice-url"
              type="url"
              placeholder="https://example.com/invoice.pdf"
              value={invoiceUrl}
              onChange={(e) => setInvoiceUrl(e.target.value)}
            />
          </div>
          
          <div>
            <Label htmlFor="invoice-id">Invoice ID (optional)</Label>
            <Input
              id="invoice-id"
              type="text"
              placeholder="Existing invoice ID to update"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
            />
          </div>

          <Button
            onClick={handleUrlProcessing}
            disabled={loading || !invoiceUrl.trim()}
            className="w-full"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Process URL
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};