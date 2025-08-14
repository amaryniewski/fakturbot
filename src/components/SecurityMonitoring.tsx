import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Shield, Users, FileText } from "lucide-react";

interface DataIsolationReport {
  user_id: string;
  invoice_count: number;
  gmail_connections_count: number;
  fakturownia_connections_count: number;
  storage_files_count: number;
  potential_security_issues: any;
}

interface SecurityViolation {
  violation_type: string;
  severity: string;
  affected_users: string[];
  details: any;
  recommended_action: string;
}

export const SecurityMonitoring = () => {
  const [isolationReport, setIsolationReport] = useState<DataIsolationReport[]>([]);
  const [violations, setViolations] = useState<SecurityViolation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSecurityReport = async () => {
    setLoading(true);
    try {
      // Pobierz raport izolacji danych
      const { data: reportData } = await supabase.rpc('get_user_data_isolation_report');
      setIsolationReport(reportData || []);

      // Sprawdź naruszenia bezpieczeństwa
      const { data: violationData } = await supabase.rpc('check_data_isolation_violations');
      setViolations(violationData || []);
    } catch (error) {
      console.error('Failed to fetch security report:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSecurityReport();
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'destructive';
      case 'HIGH': return 'destructive';
      case 'MEDIUM': return 'secondary';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6" />
          Monitoring Bezpieczeństwa
        </h2>
        <Button onClick={fetchSecurityReport} disabled={loading}>
          {loading ? 'Odświeżanie...' : 'Odśwież Raport'}
        </Button>
      </div>

      {/* Naruszenia bezpieczeństwa */}
      {violations.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Wykryto {violations.length} naruszeń bezpieczeństwa! Wymagana natychmiastowa uwaga.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        {violations.map((violation, index) => (
          <Card key={index} className="border-red-200">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">{violation.violation_type}</CardTitle>
                <Badge variant={getSeverityColor(violation.severity)}>
                  {violation.severity}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong>Zalecane działanie:</strong> {violation.recommended_action}
                </p>
                <details className="text-xs">
                  <summary className="cursor-pointer">Szczegóły</summary>
                  <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                    {JSON.stringify(violation.details, null, 2)}
                  </pre>
                </details>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Raport izolacji danych */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Raport Izolacji Danych Użytkowników
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isolationReport.map((report) => (
              <div key={report.user_id} className="flex items-center justify-between p-3 border rounded">
                <div className="flex items-center gap-4">
                  <div className="text-sm font-mono">{report.user_id}</div>
                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline">
                      <FileText className="h-3 w-3 mr-1" />
                      {report.invoice_count} faktur
                    </Badge>
                    <Badge variant="outline">
                      📧 {report.gmail_connections_count} Gmail
                    </Badge>
                    <Badge variant="outline">
                      💼 {report.fakturownia_connections_count} Fakturownia
                    </Badge>
                    <Badge variant="outline">
                      📁 {report.storage_files_count} plików
                    </Badge>
                  </div>
                </div>
                
                {/* Ostrzeżenia bezpieczeństwa */}
                <div className="flex gap-1">
                  {report.potential_security_issues?.has_invoices_without_connections && (
                    <Badge variant="destructive" className="text-xs">
                      Faktury bez połączeń
                    </Badge>
                  )}
                  {report.potential_security_issues?.has_files_without_invoices && (
                    <Badge variant="destructive" className="text-xs">
                      Pliki bez faktur
                    </Badge>
                  )}
                  {report.potential_security_issues?.missing_file_isolation && (
                    <Badge variant="destructive" className="text-xs">
                      Brak izolacji plików
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};