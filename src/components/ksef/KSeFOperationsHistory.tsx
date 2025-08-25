// src/components/ksef/KSeFOperationsHistory.tsx

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { KSeFOperation } from '@/types/ksef/api';

interface KSeFOperationsHistoryProps {
  operations: KSeFOperation[];
}

export const KSeFOperationsHistory: React.FC<KSeFOperationsHistoryProps> = ({
  operations
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'pending':
      case 'processing':
        return <Loader2 className="w-4 h-4 text-primary animate-spin" />;
      case 'timeout':
        return <AlertCircle className="w-4 h-4 text-orange-600" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      success: 'bg-green-100 text-green-800 border-green-200',
      error: 'bg-red-100 text-red-800 border-red-200',
      pending: 'bg-primary/10 text-primary border-primary/20',
      processing: 'bg-primary/10 text-primary border-primary/20',
      timeout: 'bg-orange-100 text-orange-800 border-orange-200'
    };

    const labels = {
      success: 'Zakończone',
      error: 'Błąd',
      pending: 'Oczekuje',
      processing: 'W trakcie',
      timeout: 'Timeout'
    };

    return (
      <Badge variant="outline" className={variants[status as keyof typeof variants] || 'bg-muted text-muted-foreground'}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.round(ms / 60000)}min`;
  };

  const anonymizeData = (data: any) => {
    if (!data) return null;
    
    // Remove sensitive data from display
    const { sessionId, queryId, ...safeData } = data;
    return {
      ...safeData,
      sessionId: sessionId ? '***' + sessionId.slice(-8) : undefined,
      queryId: queryId ? '***' + queryId.slice(-8) : undefined
    };
  };

  const getOperationTypeLabel = (type: string) => {
    const labels = {
      session_init: 'Inicjalizacja sesji',
      query_start: 'Rozpoczęcie zapytania',
      query_status: 'Sprawdzanie statusu',
      query_result: 'Pobieranie wyników',
      invoice_fetch: 'Pobieranie faktur'
    };
    return labels[type as keyof typeof labels] || type;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Historia operacji
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Szczegółowa historia wszystkich operacji pobierania z KSeF
        </p>
      </CardHeader>
      <CardContent>
        {operations.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Brak operacji do wyświetlenia</p>
          </div>
        ) : (
          <div className="space-y-4">
            {operations.map((operation) => (
              <div key={operation.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(operation.status)}
                    <div>
                      <h3 className="font-medium">
                        {getOperationTypeLabel(operation.operation_type)}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(operation.created_at).toLocaleString('pl-PL')}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(operation.status)}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Znalezione</p>
                    <p className="font-medium">{operation.invoices_found}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Nowe</p>
                    <p className="font-medium text-green-600">{operation.invoices_new}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Duplikaty</p>
                    <p className="font-medium text-orange-600">{operation.duplicates_found}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Czas</p>
                    <p className="font-medium">{formatDuration(operation.processing_time_ms)}</p>
                  </div>
                </div>

                {operation.error_message && (
                  <div className="mt-3 p-3 bg-destructive/5 border border-destructive/20 rounded">
                    <p className="text-sm text-destructive">
                      <strong>Błąd:</strong> {operation.error_message}
                    </p>
                    {operation.error_code && (
                      <p className="text-xs text-destructive/80 mt-1">
                        Kod: {operation.error_code}
                      </p>
                    )}
                  </div>
                )}

                {operation.response_data && (
                  <details className="mt-3">
                    <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                      Szczegóły operacji
                    </summary>
                    <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto">
                      {JSON.stringify(anonymizeData(operation.response_data), null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};