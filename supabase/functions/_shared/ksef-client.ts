// supabase/functions/_shared/ksef-client.ts

import { KSeFConfig, KSeFSession, KSeFChallenge, KSeFQueryResponse } from './types.ts';
import { KSEF_ENDPOINTS } from './ksef-urls.ts';
import { anonymizeForLogs, calculateSha256Hash } from './crypto.ts';

export class KSeFClient {
  private config: KSeFConfig;
  private currentSession: KSeFSession | null = null;

  constructor(config: KSeFConfig) {
    this.config = {
      sessionHeaderType: 'bearer',
      timeout: 30000,
      ...config
    };
  }

  /**
   * Test podstawowego połączenia z API KSeF
   */
  async testConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(`${this.config.baseUrl}/online/Session/Status`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.error('KSeF connection test failed:', anonymizeForLogs(error));
      return false;
    }
  }

  /**
   * POPRAWKA: Pobieranie wyzwania autoryzacyjnego z prawidłową strukturą
   */
  async getChallenge(): Promise<KSeFChallenge> {
    const timestamp = new Date().toISOString();
    
    // POPRAWKA: Używamy 'context' zamiast 'contextIdentifier'
    const payload = {
      context: {
        identifier: this.config.nip,
        identifierType: 'onip',
        timestamp: timestamp
      }
    };

    console.log('Getting authorization challenge for NIP:', anonymizeForLogs(this.config.nip));

    const response = await this.makeRequest(
      KSEF_ENDPOINTS.authorizationChallenge,
      'POST',
      payload
    );

    if (!response.challenge || !response.timestamp) {
      throw new Error('Invalid challenge response from KSeF API');
    }

    return {
      challenge: response.challenge,
      timestamp: response.timestamp
    };
  }

  /**
   * POPRAWKA: Inicjalizacja sesji z tokenem
   */
  async initSessionToken(): Promise<KSeFSession> {
    try {
      const { challenge, timestamp } = await this.getChallenge();
      
      const payload = {
        context: {
          identifier: this.config.nip,
          identifierType: 'onip',
          timestamp: timestamp
        },
        challenge: challenge,
        token: this.config.token
      };

      console.log('Initializing KSeF session...');

      const response = await this.makeRequest(
        KSEF_ENDPOINTS.initToken,
        'POST',
        payload
      );

      if (!response.sessionId || !response.sessionToken) {
        throw new Error('Invalid session response from KSeF API');
      }

      this.currentSession = {
        sessionId: response.sessionId,
        sessionToken: response.sessionToken
      };

      console.log('KSeF session initialized successfully');
      return this.currentSession;

    } catch (error) {
      console.error('Failed to initialize KSeF session:', anonymizeForLogs(error));
      throw error;
    }
  }

  /**
   * POPRAWKA: Rozpoczęcie zapytania o faktury z sessionId w body
   */
  async startInvoiceQuery(
    subjectType: 'subject1' | 'subject2' | 'subject3' = 'subject1',
    dateFrom?: string,
    dateTo?: string
  ): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session - call initSessionToken first');
    }

    // POPRAWKA: sessionId w body zapytania, nie w nagłówku
    const payload: any = {
      sessionId: this.currentSession.sessionId,
      subjectType: subjectType
    };

    // Dodaj daty jeśli podane (format YYYY-MM-DD)
    if (dateFrom) {
      payload.dateFrom = dateFrom;
    }
    if (dateTo) {
      payload.dateTo = dateTo;
    }

    console.log('Starting invoice query with params:', anonymizeForLogs(payload));

    const response = await this.makeAuthenticatedRequest(
      KSEF_ENDPOINTS.invoiceQuery,
      'POST',
      payload
    );

    if (!response.queryId) {
      throw new Error('Invalid query start response from KSeF API');
    }

    console.log('Invoice query started successfully');
    return response.queryId;
  }

  /**
   * Sprawdzanie statusu zapytania
   */
  async checkQueryStatus(queryId: string): Promise<KSeFQueryResponse> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const url = `${KSEF_ENDPOINTS.invoiceQuery}/${this.currentSession.sessionId}/${queryId}`;
    
    console.log('Checking query status...');

    const response = await this.makeAuthenticatedRequest(url, 'GET');

    return {
      queryId: queryId,
      items: response.items || [],
      hasMore: response.hasMore || false,
      totalItems: response.totalItems || 0
    };
  }

  /**
   * Pobieranie pakietu wyników (ZIP)
   */
  async getQueryResult(queryId: string, partNumber: string): Promise<ArrayBuffer> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const url = `${KSEF_ENDPOINTS.invoiceQuery}/${this.currentSession.sessionId}/${queryId}/${partNumber}`;
    
    console.log(`Downloading package ${partNumber}...`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}${url}`, {
        method: 'GET',
        signal: controller.signal,
        headers: this.getAuthHeaders()
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.arrayBuffer();

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Zamknięcie sesji
   */
  async closeSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      const url = `${KSEF_ENDPOINTS.sessionClose}/${this.currentSession.sessionId}`;
      
      await this.makeAuthenticatedRequest(url, 'POST');
      
      console.log('KSeF session closed successfully');
    } catch (error) {
      console.error('Failed to close KSeF session:', anonymizeForLogs(error));
    } finally {
      this.currentSession = null;
    }
  }

  /**
   * POPRAWKA: Konfigurowalny nagłówek autoryzacji
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    if (this.currentSession) {
      if (this.config.sessionHeaderType === 'bearer') {
        headers['Authorization'] = `Bearer ${this.currentSession.sessionToken}`;
      } else {
        headers['Session-Token'] = this.currentSession.sessionToken;
      }
    }

    return headers;
  }

  /**
   * Wykonanie zapytania z autoryzacją
   */
  private async makeAuthenticatedRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: any
  ): Promise<any> {
    return this.makeRequest(endpoint, method, body, this.getAuthHeaders());
  }

  /**
   * Podstawowe wykonanie zapytania HTTP
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: any,
    additionalHeaders?: Record<string, string>
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...additionalHeaders
    };

    try {
      const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`);
      }
      
      throw error;
    }
  }
}

/**
 * Walidacja NIP (10 cyfr)
 */
export function validateNip(nip: string): boolean {
  return /^\d{10}$/.test(nip);
}

/**
 * Walidacja tokenu KSeF (podstawowa)
 */
export function validateKSeFToken(token: string): boolean {
  return token.length >= 10 && token.length <= 1000;
}

/**
 * Obliczanie hash faktury dla wykrywania duplikatów
 */
export async function calculateInvoiceHash(xmlContent: string): Promise<string> {
  // Normalizacja XML przed hashowaniem
  const normalizedXml = xmlContent
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
  
  return await calculateSha256Hash(normalizedXml);
}