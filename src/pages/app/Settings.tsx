import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useGmailIntegration } from "@/hooks/useGmailIntegration";
import { Mail, Trash2 } from "lucide-react";

const SettingsPage = () => {
  const { connections, loading, connectGmail, disconnectGmail } = useGmailIntegration();
  
  useEffect(() => { document.title = "FakturBot – Settings"; }, []);
  
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Mailboxes</CardTitle>
          <CardDescription>Zarządzaj skrzynkami pocztowymi do automatycznego importu faktur.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Button 
              onClick={connectGmail}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <Mail className="h-4 w-4" />
              {loading ? "Łączenie..." : "Connect Gmail"}
            </Button>
            {connections.length > 0 && (
              <Badge variant="secondary">{connections.length} połączeń</Badge>
            )}
          </div>
          
          {connections.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Połączone konta:</h4>
              {connections.map((connection) => (
                <div key={connection.id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{connection.email}</div>
                      <div className="text-sm text-muted-foreground">
                        Połączono: {new Date(connection.created_at).toLocaleDateString('pl-PL')}
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
          
          {connections.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Brak połączonych kont Gmail</p>
              <p className="text-sm">Połącz swoje konto, aby automatycznie importować faktury z e-maili</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
          <CardDescription>Dane firmy (placeholder).</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Company name</Label>
            <Input placeholder="ACME Company" />
          </div>
          <div className="space-y-2">
            <Label>NIP</Label>
            <Input placeholder="123-456-78-90" />
          </div>
          <div className="space-y-2">
            <Label>Default currency</Label>
            <Input placeholder="PLN" />
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" disabled>Zapisz (wkrótce)</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>Połącz systemy zewnętrzne.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md border p-4">
            <div>
              <div className="font-medium">Fakturownia</div>
              <div className="text-sm text-muted-foreground">Status: Connected</div>
            </div>
            <Button variant="outline">Disconnect</Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default SettingsPage;
