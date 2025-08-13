import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export function SecurityAlert() {
  const { data: securityIssue } = useQuery({
    queryKey: ['security-check-data-mixing'],
    queryFn: async () => {
      // Check for actual data mixing by looking for invoices with wrong user_id
      const { data, error } = await supabase
        .from('invoices')
        .select('id, user_id, gmail_message_id')
        .not('gmail_message_id', 'is', null);
      
      if (error) throw error;
      
      // Check for duplicates across different users (real security issue)
      const messageIds = data?.map(inv => inv.gmail_message_id) || [];
      const uniqueMessages = new Set(messageIds);
      
      if (messageIds.length !== uniqueMessages.size) {
        // Found duplicates - check if they belong to different users
        const messageUserMap = new Map();
        for (const invoice of data || []) {
          const existing = messageUserMap.get(invoice.gmail_message_id);
          if (existing && existing !== invoice.user_id) {
            return { hasDataMixing: true, count: data.length };
          }
          messageUserMap.set(invoice.gmail_message_id, invoice.user_id);
        }
      }
      
      return { hasDataMixing: false, count: 0 };
    },
    staleTime: 300000, // 5 minutes
  });

  const handleContactSupport = () => {
    toast.info("W przypadku problemów z bezpieczeństwem kont, skontaktuj się z administratorem.");
  };

  if (!securityIssue?.hasDataMixing) {
    return null;
  }

  return (
    <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
      <AlertTriangle className="h-4 w-4 text-red-600" />
      <AlertTitle className="text-red-800 dark:text-red-200">
        KRYTYCZNY PROBLEM BEZPIECZEŃSTWA
      </AlertTitle>
      <AlertDescription className="text-red-700 dark:text-red-300">
        <div className="space-y-2">
          <p>
            Wykryto mieszanie danych faktur między użytkownikami! Znaleźliśmy faktury z tym samym Gmail Message ID przypisane do różnych użytkowników.
            Natychmiast skontaktuj się z administratorem.
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleContactSupport}
              className="text-red-800 border-red-300 hover:bg-red-100"
            >
              Skontaktuj się z pomocą
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}