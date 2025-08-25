// src/components/ksef/KSeFInvoiceRegistry.tsx

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileText, CheckCircle, XCircle, AlertCircle, Copy } from 'lucide-react';
import { KSeFInvoiceRegistry as KSeFInvoiceRegistryType } from '@/types/ksef/api';

interface KSeFInvoiceRegistryProps {
  invoices: KSeFInvoiceRegistryType[];
}

export const KSeFInvoiceRegistry: React.FC<KSeFInvoiceRegistryProps> = ({
  invoices
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = !searchTerm || 
      invoice.ksef_invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.seller_nip.includes(searchTerm) ||
      (invoice.buyer_nip && invoice.buyer_nip.includes(searchTerm));
    
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'fetched':
        return <FileText className="w-4 h-4 text-primary" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'duplicate':
        return <Copy className="w-4 h-4 text-orange-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      processed: 'bg-green-100 text-green-800 border-green-200',
      fetched: 'bg-primary/10 text-primary border-primary/20',
      error: 'bg-red-100 text-red-800 border-red-200',
      duplicate: 'bg-orange-100 text-orange-800 border-orange-200'
    };

    const labels = {
      processed: 'Przetworzone',
      fetched: 'Pobrane',
      error: 'Błąd',
      duplicate: 'Duplikat'
    };

    return (
      <Badge variant="outline" className={variants[status as keyof typeof variants] || 'bg-muted text-muted-foreground'}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: currency || 'PLN'
    }).format(amount);
  };

  const anonymizeElementRef = (ref: string) => {
    return ref.length > 8 ? '***' + ref.slice(-8) : ref;
  };

  const anonymizeHash = (hash: string) => {
    return hash.length > 8 ? hash.slice(0, 8) + '***' : hash;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Rejestr faktur KSeF
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Wszystkie faktury zarejestrowane w systemie z wykrywaniem duplikatów
            </p>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            {filteredInvoices.length} pozycji
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
                placeholder="Szukaj po numerze faktury lub NIP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtruj po statusie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="processed">Przetworzone</SelectItem>
              <SelectItem value="fetched">Pobrane</SelectItem>
              <SelectItem value="duplicate">Duplikaty</SelectItem>
              <SelectItem value="error">Błędy</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Registry List */}
        {filteredInvoices.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {searchTerm || statusFilter !== 'all' 
                ? 'Brak faktur pasujących do filtrów' 
                : 'Brak faktur w rejestrze'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredInvoices.map((invoice) => (
              <div 
                key={invoice.id}
                className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(invoice.status)}
                      <h3 className="font-medium">{invoice.ksef_invoice_number}</h3>
                      {getStatusBadge(invoice.status)}
                      <span className="text-sm text-muted-foreground">
                        {new Date(invoice.issue_date).toLocaleDateString('pl-PL')}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Element Ref</p>
                        <p className="font-mono text-xs">
                          {anonymizeElementRef(invoice.ksef_element_reference_number)}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">Sprzedawca NIP</p>
                        <p className="font-medium">{invoice.seller_nip}</p>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">Kwota</p>
                        <p className="font-medium">
                          {formatCurrency(invoice.total_amount, invoice.currency)}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-muted-foreground">Hash</p>
                        <p className="font-mono text-xs">
                          {anonymizeHash(invoice.invoice_hash)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          Pierwsze wykrycie: {new Date(invoice.first_seen_at).toLocaleString('pl-PL')}
                        </span>
                        {invoice.last_updated_at !== invoice.first_seen_at && (
                          <span>
                            Ostatnia aktualizacja: {new Date(invoice.last_updated_at).toLocaleString('pl-PL')}
                          </span>
                        )}
                        {invoice.parsed_data_id && (
                          <span className="text-green-600">
                            • Połączone z danymi
                          </span>
                        )}
                      </div>
                    </div>
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