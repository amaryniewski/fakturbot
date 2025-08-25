// supabase/functions/_shared/xml-parser.ts

import { KSeFInvoiceData } from './types.ts';
import { calculateInvoiceHash } from './ksef-client.ts';
import { Buffer } from 'node:buffer';

export class KSeFXmlParser {
  /**
   * Parsowanie pakietu ZIP z fakturami
   */
  async parseZipPackage(zipBuffer: ArrayBuffer): Promise<KSeFInvoiceData[]> {
    const invoices: KSeFInvoiceData[] = [];
    
    try {
      // POPRAWKA: Użycie adm-zip do obsługi pakietów ZIP
      const zip = new (await import('npm:adm-zip@0.5.10')).default(Buffer.from(zipBuffer));
      const entries = zip.getEntries();

      for (const entry of entries) {
        if (entry.entryName.endsWith('.xml') && !entry.isDirectory) {
          const xmlContent = entry.getData().toString('utf8');
          
          try {
            const invoiceData = await this.parseInvoiceXml(xmlContent);
            if (invoiceData) {
              invoices.push(invoiceData);
            }
          } catch (error) {
            console.error(`Failed to parse XML file ${entry.entryName}:`, error);
            // Kontynuuj z następnym plikiem
          }
        }
      }

      console.log(`Parsed ${invoices.length} invoices from ZIP package`);
      return invoices;

    } catch (error) {
      console.error('Failed to parse ZIP package:', error);
      throw new Error('Invalid ZIP package format');
    }
  }

  /**
   * Parsowanie pojedynczego XML faktury
   */
  async parseInvoiceXml(xmlContent: string): Promise<KSeFInvoiceData | null> {
    try {
      // Wyodrębnienie podstawowych danych z XML
      const elementReferenceNumber = this.extractElementReferenceNumber(xmlContent);
      if (!elementReferenceNumber) {
        throw new Error('Missing ElementReferenceNumber in XML');
      }

      // Parsowanie struktury faktury (FA(2) format)
      const invoiceData = this.parseFA2Structure(xmlContent);
      if (!invoiceData) {
        throw new Error('Failed to parse invoice structure');
      }

      // Obliczenie hash dla wykrywania duplikatów
      const hash = await calculateInvoiceHash(xmlContent);

      return {
        elementReferenceNumber,
        invoiceNumber: invoiceData.invoiceNumber,
        issueDate: invoiceData.issueDate,
        sellerName: invoiceData.sellerName,
        sellerNip: invoiceData.sellerNip,
        buyerName: invoiceData.buyerName,
        buyerNip: invoiceData.buyerNip,
        totalGross: invoiceData.totalGross,
        currency: invoiceData.currency || 'PLN',
        xmlContent: xmlContent
      };

    } catch (error) {
      console.error('Failed to parse invoice XML:', error);
      return null;
    }
  }

  /**
   * Wyodrębnienie ElementReferenceNumber z XML
   */
  extractElementReferenceNumber(xmlContent: string): string | null {
    const match = xmlContent.match(/<ElementReferenceNumber[^>]*>([^<]+)<\/ElementReferenceNumber>/);
    return match ? match[1].trim() : null;
  }

  /**
   * Parsowanie struktury FA(2) - format KSeF 1.0
   */
  private parseFA2Structure(xmlContent: string): any | null {
    try {
      // Podstawowe pola faktury FA(2)
      const invoiceNumber = this.extractXmlValue(xmlContent, 'P_2') || 
                           this.extractXmlValue(xmlContent, 'NrFaKorygowanej') ||
                           'UNKNOWN';
      
      const issueDate = this.extractXmlValue(xmlContent, 'P_1') || 
                       this.extractXmlValue(xmlContent, 'DataWystawienia') ||
                       new Date().toISOString().split('T')[0];

      // Dane sprzedawcy
      const sellerName = this.extractXmlValue(xmlContent, 'P_3A') ||
                        this.extractXmlValue(xmlContent, 'NazwaSprzedawcy') ||
                        'UNKNOWN';
      
      const sellerNip = this.extractXmlValue(xmlContent, 'P_3B') ||
                       this.extractXmlValue(xmlContent, 'NIPSprzedawcy') ||
                       'UNKNOWN';

      // Dane nabywcy
      const buyerName = this.extractXmlValue(xmlContent, 'P_4A') ||
                       this.extractXmlValue(xmlContent, 'NazwaNabywcy') ||
                       'UNKNOWN';
      
      const buyerNip = this.extractXmlValue(xmlContent, 'P_4B') ||
                      this.extractXmlValue(xmlContent, 'NIPNabywcy');

      // Kwota brutto
      const totalGrossStr = this.extractXmlValue(xmlContent, 'P_15') ||
                           this.extractXmlValue(xmlContent, 'WartoscBrutto') ||
                           '0';
      
      const totalGross = parseFloat(totalGrossStr.replace(',', '.')) || 0;

      // Waluta
      const currency = this.extractXmlValue(xmlContent, 'KodWaluty') || 'PLN';

      return {
        invoiceNumber,
        issueDate,
        sellerName,
        sellerNip,
        buyerName,
        buyerNip,
        totalGross,
        currency
      };

    } catch (error) {
      console.error('Failed to parse FA(2) structure:', error);
      return null;
    }
  }

  /**
   * PRZYGOTOWANIE: Parsowanie struktury FA(3) - format KSeF 2.0 (od lutego 2026)
   */
  private parseFA3Structure(xmlContent: string): any | null {
    // TODO: Implementacja parsera FA(3) gdy pojawi się oficjalna specyfikacja
    console.log('FA(3) format not yet implemented - waiting for official specification');
    return null;
  }

  /**
   * Wyodrębnienie wartości z XML po nazwie tagu
   */
  private extractXmlValue(xmlContent: string, tagName: string): string | null {
    const patterns = [
      new RegExp(`<${tagName}[^>]*>([^<]+)<\/${tagName}>`, 'i'),
      new RegExp(`<${tagName}[^>]*>\\s*<!\\[CDATA\\[([^\\]]+)\\]\\]>\\s*<\/${tagName}>`, 'i')
    ];

    for (const pattern of patterns) {
      const match = xmlContent.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * Walidacja struktury XML faktury
   */
  validateInvoiceXml(xmlContent: string): boolean {
    try {
      // Sprawdź czy to prawidłowy XML
      if (!xmlContent.includes('<?xml') || !xmlContent.includes('<Faktura')) {
        return false;
      }

      // Sprawdź czy zawiera wymagane elementy
      const requiredElements = ['ElementReferenceNumber'];
      for (const element of requiredElements) {
        if (!xmlContent.includes(`<${element}`)) {
          return false;
        }
      }

      return true;

    } catch (error) {
      return false;
    }
  }

  /**
   * Wykrywanie formatu faktury (FA(2) vs FA(3))
   */
  detectInvoiceFormat(xmlContent: string): 'FA2' | 'FA3' | 'UNKNOWN' {
    if (xmlContent.includes('<Fa>') || xmlContent.includes('P_1')) {
      return 'FA2'; // KSeF 1.0
    } else if (xmlContent.includes('<Invoice>') || xmlContent.includes('InvoiceHeader')) {
      return 'FA3'; // KSeF 2.0 (przyszłość)
    }
    
    return 'UNKNOWN';
  }
}