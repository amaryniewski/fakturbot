import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export function SecurityAlert() {
  const { data: duplicateConnections } = useQuery({
    queryKey: ['security-check-duplicates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('get_user_gmail_connections');
      
      if (error) throw error;
      
      // Check if user has any inactive connections (which might indicate past duplicates)
      const inactiveConnections = data?.filter(conn => !conn.is_active) || [];
      return inactiveConnections;
    },
    staleTime: 60000, // 1 minute
  });

  const handleContactSupport = () => {
    toast.info("W przypadku problemów z bezpieczeństwem kont, skontaktuj się z administratorem.");
  };

  if (!duplicateConnections || duplicateConnections.length === 0) {
    return null;
  }

  return (
    <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
      <Shield className="h-4 w-4 text-yellow-600" />
      <AlertTitle className="text-yellow-800 dark:text-yellow-200">
        Wykryto potencjalny problem bezpieczeństwa
      </AlertTitle>
      <AlertDescription className="text-yellow-700 dark:text-yellow-300">
        <div className="space-y-2">
          <p>
            Detected deactivated Gmail connections that may have caused data mixing between accounts. 
            This has been automatically fixed, but please verify your invoice data is correct.
          </p>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleContactSupport}
              className="text-yellow-800 border-yellow-300 hover:bg-yellow-100"
            >
              Skontaktuj się z pomocą
            </Button>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}