// src/hooks/ksef/useKSeFInvoices.ts

import { useState, useEffect } from 'react';
import { useAuthContext } from '@/context/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { KSeFInvoice } from '@/types/ksef/api';

export const useKSeFInvoices = () => {
  const { user } = useAuthContext();
  const [invoices, setInvoices] = useState<KSeFInvoice[]>([]);
  const [filteredInvoices, setFilteredInvoices] = useState<KSeFInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('ksef');

  useEffect(() => {
    if (user) {
      loadKSeFInvoices();
    }
  }, [user]);

  useEffect(() => {
    filterInvoices();
  }, [invoices, searchTerm, dateFilter, sourceFilter]);

  const loadKSeFInvoices = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { data, error: supabaseError } = await supabase
        .from('parsed_data')
        .select('*')
        .eq('user_id', user?.id)
        .eq('source_type', 'ksef')
        .order('created_at', { ascending: false })
        .limit(500);

      if (supabaseError) throw supabaseError;
      
      setInvoices((data || []) as KSeFInvoice[]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load KSeF invoices';
      setError(errorMessage);
      console.error('Failed to load KSeF invoices:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filterInvoices = () => {
    let filtered = invoices;

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(invoice => invoice.source_type === sourceFilter);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(invoice =>
        invoice.invoice_number.toLowerCase().includes(term) ||
        invoice.seller_name.toLowerCase().includes(term) ||
        invoice.buyer_name.toLowerCase().includes(term) ||
        (invoice.seller_nip && invoice.seller_nip.includes(term)) ||
        (invoice.buyer_nip && invoice.buyer_nip.includes(term))
      );
    }

    if (dateFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      
      switch (dateFilter) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          filterDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
      }
      
      filtered = filtered.filter(invoice => 
        new Date(invoice.ksef_fetch_date || invoice.created_at) >= filterDate
      );
    }

    setFilteredInvoices(filtered);
  };

  const refreshInvoices = async () => {
    await loadKSeFInvoices();
  };

  const clearError = () => {
    setError(null);
  };

  return {
    invoices: filteredInvoices,
    allInvoices: invoices,
    isLoading,
    error,
    
    // Filters
    searchTerm,
    setSearchTerm,
    dateFilter,
    setDateFilter,
    sourceFilter,
    setSourceFilter,
    
    // Actions
    refreshInvoices,
    clearError,
    
    // Stats
    totalCount: invoices.length,
    filteredCount: filteredInvoices.length
  };
};