import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from "lucide-react";

interface ImapFormData {
  email: string;
  password: string;
  server: string;
  port: number;
  secure: boolean;
}

interface ImapConnectionFormProps {
  formData: ImapFormData;
  setFormData: (data: ImapFormData) => void;
  onConnect: () => Promise<boolean>;
  onTest: (data: ImapFormData) => Promise<boolean>;
  loading: boolean;
}

// Common IMAP providers with settings
const IMAP_PROVIDERS = {
  custom: { name: 'Niestandardowe ustawienia', server: '', port: 993 },
  'gmail.com': { name: 'Gmail', server: 'imap.gmail.com', port: 993 },
  'outlook.com': { name: 'Outlook.com / Hotmail', server: 'outlook.office365.com', port: 993 },
  'yahoo.com': { name: 'Yahoo Mail', server: 'imap.mail.yahoo.com', port: 993 },
  'onet.pl': { name: 'Onet Poczta', server: 'imap.poczta.onet.pl', port: 993 },
  'wp.pl': { name: 'WP Poczta', server: 'imap.wp.pl', port: 993 },
  'interia.pl': { name: 'Interia Poczta', server: 'poczta.interia.pl', port: 993 },
};

export const ImapConnectionForm = ({ 
  formData, 
  setFormData, 
  onConnect, 
  onTest, 
  loading 
}: ImapConnectionFormProps) => {
  const [selectedProvider, setSelectedProvider] = useState<string>('custom');
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    const provider = IMAP_PROVIDERS[providerId as keyof typeof IMAP_PROVIDERS];
    if (provider && providerId !== 'custom') {
      setFormData({
        ...formData,
        server: provider.server,
        port: provider.port,
        secure: true
      });
    }
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    const result = await onTest(formData);
    setTestResult(result);
  };

  const handleConnect = async () => {
    const success = await onConnect();
    if (success) {
      setTestResult(null);
    }
  };

  const isFormValid = formData.email && formData.password && formData.server && formData.port;

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <div className="space-y-2">
        <Label htmlFor="provider">Dostawca poczty</Label>
        <Select value={selectedProvider} onValueChange={handleProviderChange}>
          <SelectTrigger>
            <SelectValue placeholder="Wybierz dostawcę" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(IMAP_PROVIDERS).map(([id, provider]) => (
              <SelectItem key={id} value={id}>
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Email and Password */}
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label htmlFor="imap-email">Adres e-mail</Label>
          <Input
            id="imap-email"
            type="email"
            placeholder="twoj@email.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="imap-password">Hasło</Label>
          <Input
            id="imap-password"
            type="password"
            placeholder="Hasło do skrzynki"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
          {selectedProvider === 'gmail.com' && (
            <p className="text-sm text-muted-foreground">
              Gmail wymaga hasła aplikacji. Włącz uwierzytelnianie dwuskładnikowe i wygeneruj hasło aplikacji w ustawieniach Google.
            </p>
          )}
        </div>
      </div>

      {/* Server Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ustawienia serwera</CardTitle>
          <CardDescription>
            {selectedProvider !== 'custom' 
              ? 'Ustawienia zostały wypełnione automatycznie dla wybranego dostawcy.'
              : 'Wprowadź ustawienia serwera IMAP.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="imap-server">Serwer IMAP</Label>
              <Input
                id="imap-server"
                placeholder="imap.example.com"
                value={formData.server}
                onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                disabled={selectedProvider !== 'custom'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imap-port">Port</Label>
              <Input
                id="imap-port"
                type="number"
                placeholder="993"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 993 })}
                disabled={selectedProvider !== 'custom'}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Connection */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Test połączenia</h4>
              <p className="text-sm text-muted-foreground">
                Sprawdź połączenie przed zapisaniem
              </p>
            </div>
            <div className="flex items-center gap-2">
              {testResult !== null && (
                <Badge variant={testResult ? "default" : "destructive"}>
                  {testResult ? (
                    <>
                      <Wifi className="h-3 w-3 mr-1" />
                      Połączono
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3 mr-1" />
                      Błąd
                    </>
                  )}
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={!isFormValid || loading}
              >
                {loading ? "Testowanie..." : "Test"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2">
        <Button 
          onClick={handleConnect}
          disabled={!isFormValid || loading}
          className="min-w-[120px]"
        >
          {loading ? "Łączenie..." : "Połącz"}
        </Button>
      </div>
    </div>
  );
};