// src/hooks/ksef/useKSeFConfig.ts

import { useState, useEffect } from 'react';
import { useAuthContext } from '@/context/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { KSeFConfig } from '@/types/ksef/api';

export const useKSeFConfig = () => {
  const { user } = useAuthContext();
  const [config, setConfig] = useState<KSeFConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadConfig();
    } else {
      setConfig(null);
      setIsLoading(false);
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: supabaseError } = await supabase
        .from('ksef_config')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .maybeSingle();

      if (supabaseError) {
        throw supabaseError;
      }

      setConfig(data as KSeFConfig);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load KSeF configuration';
      setError(errorMessage);
      console.error('Error loading KSeF config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async (configData: Partial<KSeFConfig & { token?: string }>) => {
    if (!user) throw new Error('User not authenticated');

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: functionError } = await supabase.functions.invoke('ksef-config-save', {
        body: {
          id: config?.id,
          environment: configData.environment,
          nip: configData.nip,
          token: configData.token,
          auto_fetch: configData.auto_fetch,
          fetch_interval_minutes: configData.fetch_interval_minutes
        }
      });

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to save configuration');
      }

      setConfig(data.data);
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save KSeF configuration';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    if (!config) throw new Error('No configuration available');

    try {
      setError(null);

      const { data, error: functionError } = await supabase.functions.invoke('ksef-test', {
        body: { connectionId: config.id }
      });

      if (functionError) {
        throw new Error(functionError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Connection test failed');
      }

      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection test failed';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const deleteConfig = async () => {
    if (!config) return;

    try {
      setIsLoading(true);
      setError(null);

      const { error: supabaseError } = await supabase
        .from('ksef_config')
        .delete()
        .eq('id', config.id);

      if (supabaseError) throw supabaseError;
      
      setConfig(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete configuration';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const updateLastFetchTimestamp = async () => {
    if (!config) return;

    try {
      const { error: supabaseError } = await supabase
        .from('ksef_config')
        .update({ 
          last_fetch_timestamp: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id);

      if (supabaseError) throw supabaseError;
      
      setConfig(prev => prev ? {
        ...prev,
        last_fetch_timestamp: new Date().toISOString()
      } : null);
    } catch (err) {
      console.error('Failed to update last fetch timestamp:', err);
    }
  };

  return {
    config,
    isLoading,
    error,
    loadConfig,
    saveConfig,
    testConnection,
    deleteConfig,
    updateLastFetchTimestamp,
    hasConfig: !!config,
    clearError: () => setError(null)
  };
};