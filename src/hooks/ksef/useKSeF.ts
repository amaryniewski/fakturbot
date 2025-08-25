// src/hooks/ksef/useKSeF.ts

import { useKSeFConfig } from './useKSeFConfig';
import { useKSeFetching } from './useKSeFetching';
import { KSeFSubjectType, KSeFFetchResult } from '@/types/ksef/api';

export const useKSeF = () => {
  const config = useKSeFConfig();
  const fetching = useKSeFetching();

  const fetchInvoices = async (
    dateFrom?: string,
    dateTo?: string,
    subjectType: KSeFSubjectType = 'subject1'
  ): Promise<KSeFFetchResult> => {
    if (!config.config) {
      throw new Error('KSeF configuration not found');
    }

    return await fetching.fetchInvoicesFromKSeF(
      config.config.id,
      dateFrom,
      dateTo,
      subjectType
    );
  };

  const isConfigured = config.hasConfig && !config.isLoading;
  const isReady = isConfigured && !fetching.isLoading;

  return {
    // Configuration
    config: config.config,
    hasConfig: config.hasConfig,
    isConfigured,
    saveConfig: config.saveConfig,
    testConnection: config.testConnection,
    deleteConfig: config.deleteConfig,
    updateLastFetchTimestamp: config.updateLastFetchTimestamp,

    // Fetching operations
    operations: fetching.operations,
    invoiceRegistry: fetching.invoiceRegistry,
    stats: fetching.stats,
    fetchInvoices,

    // State
    isLoading: config.isLoading || fetching.isLoading,
    isReady,
    error: config.error || fetching.error,

    // Actions
    refreshData: fetching.refreshData,
    clearError: () => {
      config.clearError();
      fetching.clearError();
    }
  };
};