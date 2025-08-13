import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/context/UserContext";

export interface InvoiceStats {
  totalCount: number;
  newCount: number;
  processingCount: number;
  successCount: number;
  failedCount: number;
}

export function useInvoiceStats() {
  const { user } = useAuthContext();

  return useQuery({
    queryKey: ['invoice-stats', user?.id],
    queryFn: async (): Promise<InvoiceStats> => {
      if (!user?.id) {
        return {
          totalCount: 0,
          newCount: 0,
          processingCount: 0,
          successCount: 0,
          failedCount: 0
        };
      }

      const { data, error } = await supabase
        .rpc('get_user_invoice_stats', { p_user_id: user.id });

      if (error) {
        console.error('Error fetching invoice stats:', error);
        throw error;
      }

      // Map snake_case to camelCase
      const result = data?.[0];
      if (result) {
        return {
          totalCount: result.total_count,
          newCount: result.new_count,
          processingCount: result.processing_count,
          successCount: result.success_count,
          failedCount: result.failed_count
        };
      }

      return {
        totalCount: 0,
        newCount: 0,
        processingCount: 0,
        successCount: 0,
        failedCount: 0
      };
    },
    enabled: !!user?.id,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });
}