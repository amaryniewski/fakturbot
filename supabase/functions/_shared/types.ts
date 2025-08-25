// supabase/functions/_shared/types.ts

export interface KSeFConfig {
  nip: string;
  token: string;
  baseUrl: string;
  sessionHeaderType?: 'bearer' | 'session-token';
  timeout?: number;
}

export interface KSeFSession {
  sessionId: string;
  sessionToken: string;
}

export interface KSeFChallenge {
  challenge: string;
  timestamp: string;
}

export interface KSeFQueryResponse {
  queryId: string;
  items?: Array<{
    partNumber: string;
    size: number;
  }>;
  hasMore?: boolean;
  totalItems?: number;
}

export interface KSeFInvoiceData {
  elementReferenceNumber: string;
  invoiceNumber: string;
  issueDate: string;
  sellerName: string;
  sellerNip: string;
  buyerName: string;
  buyerNip?: string;
  totalGross: number;
  currency: string;
  xmlContent: string;
}

export const KSEF_SUBJECT_TYPES = {
  subject1: 'Faktury otrzymane przez podmiot',
  subject2: 'Faktury wystawione przez podmiot', 
  subject3: 'Wszystkie faktury powiązane z podmiotem'
} as const;

export type KSeFSubjectType = keyof typeof KSEF_SUBJECT_TYPES;