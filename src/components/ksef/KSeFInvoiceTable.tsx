// src/components/ksef/KSeFInvoiceTable.tsx

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileText, ExternalLink, Eye } from 'lucide-react';
import { useKSeFInvoices } from '@/hooks/ksef/useKSeFInvoices';

export const KSeFInvoiceTable: React.FC = () => {
  const {
    invoices,
    isLoading,
    searchTerm,
    setSearchTerm,
    dateFilter,
    setDateFilter,
    filteredCount,
    totalCount
  } = useKSeFInvoices();

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: currency || 'PLN'
    }).format(amount);
  };

  const anonymizeElementRef = (ref: string) => {
    // Show only last 8 characters for security
    return ref.length > 8 ? '***' + ref.slice(-8) : ref;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Faktury z KSeF</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Faktury z KSeF
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Faktury pobrane automatycznie z systemu KSeF
            </p>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            {filteredCount} z {totalCount} faktur
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Szukaj po numerze, nazwie lub NIP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtruj po dacie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="today">Dzisiaj</SelectItem>
              <SelectItem value="week">Ostatni tydzień</SelectItem>
              <SelectItem value="month">Ostatni miesiąc</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Invoice List */}
        {invoices.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {searchTerm || dateFilter !== 'all' 
                ? 'Brak faktur pasujących do filtrów' 
                : 'Brak faktur z KSeF'
              }
            </p>
            {!searchTerm && dateFilter === 'all' && (
              <p className="text-sm text-muted-foreground mt-2">
                Faktury będą pojawiać się tutaj po pobraniu z systemu KSeF
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <div 
                key={invoice.id}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium">{invoice.invoice_number}</h3>
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                        KSeF
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(invoice.issue_date).toLocaleDateString('pl-PL')}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Sprzedawca</p>
                        <p className="font-medium">{invoice.seller_name}</p>
                        {invoice.seller_nip && (
                          <p className="text-muted-foreground">NIP: {invoice.seller_nip}</p>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">Nabywca</p>
                        <p className="font-medium">{invoice.buyer_name}</p>
                        {invoice.buyer_nip && (
                          <p className="text-muted-foreground">NIP: {invoice.buyer_nip}</p>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">Kwota</p>
                        <p className="font-medium text-lg">
                          {formatCurrency(invoice.total_amount, invoice.currency)}
                        </p>
                      </div>
                    </div>

                    {invoice.ksef_fetch_date && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground">
                          Pobrano z KSeF: {new Date(invoice.ksef_fetch_date).toLocaleString('pl-PL')}
                          {invoice.ksef_element_reference_number && (
                            <span className="ml-2">
                              • Ref: {anonymizeElementRef(invoice.ksef_element_reference_number)}
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Button variant="outline" size="sm">
                      <Eye className="w-4 h-4 mr-2" />
                      Szczegóły
                    </Button>
                    {invoice.ksef_element_reference_number && (
                      <Button variant="outline" size="sm">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        KSeF
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};