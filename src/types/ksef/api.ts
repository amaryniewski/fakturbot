// src/types/ksef/api.ts

export interface KSeFConfig {
  id: string;
  user_id: string;
  environment: 'test' | 'production';
  nip: string;
  auto_fetch: boolean;
  fetch_interval_minutes: number;
  last_fetch_timestamp?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KSeFOperation {
  id: string;
  user_id: string;
  operation_type: 'session_init' | 'query_start' | 'query_status' | 'query_result' | 'invoice_fetch';
  status: 'pending' | 'success' | 'error' | 'processing' | 'timeout';
  session_id?: string;
  query_id?: string;
  invoices_found: number;
  invoices_processed: number;
  invoices_new: number;
  packages_count: number;
  duplicates_found: number;
  error_code?: string;
  error_message?: string;
  request_data?: any;
  response_data?: any;
  processing_time_ms?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface KSeFInvoiceRegistry {
  id: string;
  user_id: string;
  ksef_element_reference_number: string;
  ksef_invoice_number: string;
  invoice_hash: string;
  issue_date: string;
  seller_nip: string;
  buyer_nip?: string;
  total_amount: number;
  currency: string;
  status: 'fetched' | 'processed' | 'error' | 'duplicate';
  parsed_data_id?: string;
  first_seen_at: string;
  last_updated_at: string;
}

export interface KSeFStats {
  totalFetched: number;
  todayFetched: number;
  duplicatesFound: number;
  lastFetch: string | null;
  pendingOperations: number;
  avgProcessingTimeMs: number;
}

export interface KSeFInvoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  seller_name: string;
  seller_nip?: string;
  buyer_name: string;
  buyer_nip?: string;
  total_amount: number;
  currency: string;
  source_type: string;
  ksef_element_reference_number?: string;
  ksef_fetch_date?: string;
  created_at: string;
}

export const KSEF_SUBJECT_TYPES = {
  subject1: 'Faktury otrzymane przez podmiot',
  subject2: 'Faktury wystawione przez podmiot',
  subject3: 'Wszystkie faktury powiązane z podmiotem'
} as const;

export type KSeFSubjectType = keyof typeof KSEF_SUBJECT_TYPES;

export interface KSeFFetchResult {
  success: boolean;
  newInvoices: number;
  totalInvoices: number;
  duplicates: number;
  error?: string;
}