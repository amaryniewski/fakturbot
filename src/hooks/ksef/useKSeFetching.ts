// src/hooks/ksef/useKSeFetching.ts

import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '@/context/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  KSeFOperation, 
  KSeFInvoiceRegistry, 
  KSeFStats, 
  KSeFFetchResult,
  KSeFSubjectType 
} from '@/types/ksef/api';

export const useKSeFetching = () => {
  const { user } = useAuthContext();
  const [operations, setOperations] = useState<KSeFOperation[]>([]);
  const [invoiceRegistry, setInvoiceRegistry] = useState<KSeFInvoiceRegistry[]>([]);
  const [stats, setStats] = useState<KSeFStats>({
    totalFetched: 0,
    todayFetched: 0,
    duplicatesFound: 0,
    lastFetch: null,
    pendingOperations: 0,
    avgProcessingTimeMs: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadOperations();
      loadInvoiceRegistry();
      loadStats();
    } else {
      setOperations([]);
      setInvoiceRegistry([]);
      setStats({
        totalFetched: 0,
        todayFetched: 0,
        duplicatesFound: 0,
        lastFetch: null,
        pendingOperations: 0,
        avgProcessingTimeMs: 0
      });
    }
  }, [user]);

  const loadOperations = async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .from('ksef_fetch_operations')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (supabaseError) throw supabaseError;
      setOperations((data || []) as KSeFOperation[]);
    } catch (err) {
      console.error('Failed to load operations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load operations');
    }
  };

  const loadInvoiceRegistry = async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .from('ksef_invoice_registry')
        .select('*')
        .eq('user_id', user?.id)
        .order('first_seen_at', { ascending: false })
        .limit(1000);

      if (supabaseError) throw supabaseError;
      setInvoiceRegistry((data || []) as KSeFInvoiceRegistry[]);
    } catch (err) {
      console.error('Failed to load invoice registry:', err);
      setError(err instanceof Error ? err.message : 'Failed to load invoice registry');
    }
  };

  const loadStats = async () => {
    try {
      const { data, error: supabaseError } = await supabase
        .rpc('get_ksef_fetch_stats', { p_user_id: user?.id });

      if (supabaseError) throw supabaseError;
      
      if (data && data.length > 0) {
        const statsData = data[0];
        setStats({
          totalFetched: statsData.total_fetched || 0,
          todayFetched: statsData.today_fetched || 0,
          duplicatesFound: statsData.duplicates_found || 0,
          lastFetch: statsData.last_fetch,
          pendingOperations: statsData.pending_operations || 0,
          avgProcessingTimeMs: statsData.avg_processing_time_ms || 0
        });
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    }
  };

  const fetchInvoicesFromKSeF = async (
    connectionId: string,
    dateFrom?: string,
    dateTo?: string,
    subjectType: KSeFSubjectType = 'subject1'
  ): Promise<KSeFFetchResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const dateFromUTC = dateFrom ? new Date(dateFrom + 'T00:00:00.000Z').toISOString().split('T')[0] : undefined;
      const dateToUTC = dateTo ? new Date(dateTo + 'T23:59:59.999Z').toISOString().split('T')[0] : undefined;

      const { data, error: functionError } = await supabase.functions.invoke('ksef-fetch', {
        body: {
          connectionId,
          dateFrom: dateFromUTC,
          dateTo: dateToUTC,
          subjectType
        }
      });

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Unknown error occurred');
      }

      // Refresh data after successful fetch
      await Promise.all([
        loadOperations(),
        loadInvoiceRegistry(),
        loadStats()
      ]);

      return {
        success: true,
        newInvoices: data.data.newInvoices,
        totalInvoices: data.data.totalInvoices,
        duplicates: data.data.duplicates
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      
      return {
        success: false,
        newInvoices: 0,
        totalInvoices: 0,
        duplicates: 0,
        error: errorMessage
      };
    } finally {
      setIsLoading(false);
    }
  };

  const refreshData = useCallback(async () => {
    if (!user) return;
    
    await Promise.all([
      loadOperations(),
      loadInvoiceRegistry(),
      loadStats()
    ]);
  }, [user]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    operations,
    invoiceRegistry,
    stats,
    isLoading,
    error,
    fetchInvoicesFromKSeF,
    refreshData,
    clearError,
    loadOperations,
    loadInvoiceRegistry,
    loadStats
  };
};