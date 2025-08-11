import { Badge } from "@/components/ui/badge";

interface ExtractedData {
  amount?: number;
  currency?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  vendorName?: string;
  vendorNIP?: string;
  confidence?: number;
}

interface InvoiceExtractedDataProps {
  data: ExtractedData;
  confidenceScore?: number;
}

export const InvoiceExtractedData = ({ data, confidenceScore }: InvoiceExtractedDataProps) => {
  const getConfidenceBadge = (score?: number) => {
    if (!score) return null;
    
    if (score >= 0.8) {
      return <Badge className="bg-green-600 text-white">Wysoka pewność</Badge>;
    } else if (score >= 0.6) {
      return <Badge variant="secondary">Średnia pewność</Badge>;
    } else {
      return <Badge variant="destructive">Niska pewność</Badge>;
    }
  };

  return (
    <div className="border-b p-4 bg-muted/30">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">Wyodrębnione dane:</h3>
        {getConfidenceBadge(confidenceScore)}
      </div>
      
      <div className="grid grid-cols-2 gap-3 text-sm">
        {data.amount && (
          <div>
            <span className="text-muted-foreground">Kwota:</span> 
            <span className="font-medium ml-1">
              {data.amount} {data.currency || 'PLN'}
            </span>
          </div>
        )}
        
        {data.invoiceNumber && (
          <div>
            <span className="text-muted-foreground">Nr faktury:</span> 
            <span className="font-medium ml-1">{data.invoiceNumber}</span>
          </div>
        )}
        
        {data.vendorName && (
          <div>
            <span className="text-muted-foreground">Sprzedawca:</span> 
            <span className="font-medium ml-1">{data.vendorName}</span>
          </div>
        )}
        
        {data.vendorNIP && (
          <div>
            <span className="text-muted-foreground">NIP:</span> 
            <span className="font-medium ml-1">{data.vendorNIP}</span>
          </div>
        )}
        
        {data.issueDate && (
          <div>
            <span className="text-muted-foreground">Data wystawienia:</span> 
            <span className="font-medium ml-1">{data.issueDate}</span>
          </div>
        )}
        
        {data.dueDate && (
          <div>
            <span className="text-muted-foreground">Termin płatności:</span> 
            <span className="font-medium ml-1">{data.dueDate}</span>
          </div>
        )}
      </div>
    </div>
  );
};