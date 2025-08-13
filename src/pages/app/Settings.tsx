import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useGmailIntegration } from "@/hooks/useGmailIntegration";
import { useImapIntegration } from "@/hooks/useImapIntegration";
import { useFakturowniaIntegration } from "@/hooks/useFakturowniaIntegration";
import { ImapConnectionForm } from "@/components/ImapConnectionForm";
import { GmailFilterSettings } from "@/components/GmailFilterSettings";
import { InvoiceProcessingControls } from "@/components/InvoiceProcessingControls";
import { Mail, Trash2, FileText, Plus, RefreshCw, Server } from "lucide-react";

const SettingsPage = () => {
  const { connections, loading, connectGmail, disconnectGmail } = useGmailIntegration();
  const { 
    connections: imapConnections, 
    loading: imapLoading, 
    connectImap, 
    disconnectImap,
    testConnection 
  } = useImapIntegration();
  const { 
    connections: fakturowniaConnections, 
    loading: fakturowniaLoading, 
    connectFakturownia, 
    disconnectFakturownia,
    syncInvoices 
  } = useFakturowniaIntegration();
  
  const [fakturowniaDialog, setFakturowniaDialog] = useState(false);
  const [imapDialog, setImapDialog] = useState(false);
  const [formData, setFormData] = useState({
    companyName: '',
    domain: '',
    apiToken: ''
  });
  const [imapFormData, setImapFormData] = useState({
    email: '',
    password: '',
    server: '',
    port: 993,
    secure: true
  });
  
  useEffect(() => { document.title = "FakturBot – Settings"; }, []);

  const handleFakturowniaConnect = async () => {
    await connectFakturownia(formData);
    setFakturowniaDialog(false);
    setFormData({ companyName: '', domain: '', apiToken: '' });
  };

  const handleImapConnect = async () => {
    const success = await connectImap(imapFormData);
    if (success) {
      setImapDialog(false);
      setImapFormData({ email: '', password: '', server: '', port: 993, secure: true });
    }
    return success;
  };
  
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Mailboxes</CardTitle>
          <CardDescription>Zarządzaj skrzynkami pocztowymi do automatycznego importu faktur.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Gmail Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                <h4 className="font-medium">Gmail</h4>
              </div>
              <div className="flex items-center gap-2">
                {connections.length > 0 && (
                  <Badge variant="secondary">{connections.length} połączeń</Badge>
                )}
                <Button 
                  onClick={connectGmail}
                  disabled={loading}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {loading ? "Łączenie..." : "Połącz Gmail"}
                </Button>
              </div>
            </div>
          
            {connections.length > 0 && (
              <div className="space-y-2">
                {connections.map((connection) => (
                  <div key={connection.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{connection.email}</div>
                        <div className="text-sm text-muted-foreground">
                          Gmail • Połączono: {new Date(connection.created_at).toLocaleDateString('pl-PL')}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnectGmail(connection.id)}
                      className="flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Usuń
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* IMAP Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                <h4 className="font-medium">IMAP (inne skrzynki)</h4>
              </div>
              <div className="flex items-center gap-2">
                {imapConnections.length > 0 && (
                  <Badge variant="secondary">{imapConnections.length} połączeń</Badge>
                )}
                <Dialog open={imapDialog} onOpenChange={setImapDialog}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Połącz IMAP
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Połącz skrzynkę IMAP</DialogTitle>
                      <DialogDescription>
                        Wprowadź dane dostępu do swojej skrzynki pocztowej. Obsługujemy większość dostawców poczty.
                      </DialogDescription>
                    </DialogHeader>
                    <ImapConnectionForm
                      formData={imapFormData}
                      setFormData={setImapFormData}
                      onConnect={handleImapConnect}
                      onTest={testConnection}
                      loading={imapLoading}
                    />
                    <DialogFooter>
                      <Button 
                        variant="outline" 
                        onClick={() => setImapDialog(false)}
                      >
                        Anuluj
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {imapConnections.length > 0 && (
              <div className="space-y-2">
                {imapConnections.map((connection) => (
                  <div key={connection.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-3">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{connection.email}</div>
                        <div className="text-sm text-muted-foreground">
                          {connection.server}:{connection.port} • Połączono: {new Date(connection.created_at).toLocaleDateString('pl-PL')}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnectImap(connection.id)}
                      className="flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Usuń
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {connections.length === 0 && imapConnections.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Brak połączonych skrzynek pocztowych</p>
                <p className="text-sm">Połącz Gmail lub skrzynkę IMAP, aby automatycznie importować faktury</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <InvoiceProcessingControls />

      <GmailFilterSettings />

      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
          <CardDescription>Dane firmy - funkcjonalność w przygotowaniu.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Company name</Label>
            <Input disabled />
          </div>
          <div className="space-y-2">
            <Label>NIP</Label>
            <Input disabled />
          </div>
          <div className="space-y-2">
            <Label>Default currency</Label>
            <Input disabled />
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" disabled>Funkcja niedostępna</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Połącz systemy zewnętrzne do zarządzania fakturami.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Fakturownia Integration */}
          <div className="rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="font-medium">Fakturownia</div>
                  <div className="text-sm text-muted-foreground">
                    System do wystawiania faktur online
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {fakturowniaConnections.length > 0 && (
                  <Badge variant="secondary">{fakturowniaConnections.length} połączeń</Badge>
                )}
                <Dialog open={fakturowniaDialog} onOpenChange={setFakturowniaDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Dodaj konto
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Połącz z Fakturownia</DialogTitle>
                      <DialogDescription>
                        Wprowadź dane dostępu do swojego konta Fakturownia. API token znajdziesz w: 
                        Ustawienia → Ustawienia konta → Integracja → Kod autoryzacyjny API
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="companyName">Nazwa firmy</Label>
                        <Input
                          id="companyName"
                          value={formData.companyName}
                          onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="domain">Domena (bez .fakturownia.pl)</Label>
                        <Input
                          id="domain"
                          value={formData.domain}
                          onChange={(e) => setFormData(prev => ({ ...prev, domain: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="apiToken">API Token</Label>
                        <Input
                          id="apiToken"
                          type="password"
                          value={formData.apiToken}
                          onChange={(e) => setFormData(prev => ({ ...prev, apiToken: e.target.value }))}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        variant="outline" 
                        onClick={() => setFakturowniaDialog(false)}
                      >
                        Anuluj
                      </Button>
                      <Button 
                        onClick={handleFakturowniaConnect}
                        disabled={!formData.companyName || !formData.domain || !formData.apiToken || fakturowniaLoading}
                      >
                        {fakturowniaLoading ? "Łączenie..." : "Połącz"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            
            {/* Connected Fakturownia accounts */}
            {fakturowniaConnections.length > 0 && (
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-medium">Połączone konta:</h4>
                {fakturowniaConnections.map((connection) => (
                  <div key={connection.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{connection.company_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {connection.domain}.fakturownia.pl • Połączono: {new Date(connection.created_at).toLocaleDateString('pl-PL')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncInvoices(connection.id)}
                        disabled={fakturowniaLoading}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Synchronizuj
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disconnectFakturownia(connection.id)}
                        className="flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Usuń
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {fakturowniaConnections.length === 0 && (
              <div className="mt-4 text-center py-6 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Brak połączonych kont Fakturownia</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default SettingsPage;
