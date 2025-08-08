import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SettingsPage = () => {
  useEffect(() => { document.title = "FakturBot – Settings"; }, []);
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Mailboxes</CardTitle>
          <CardDescription>Zarządzaj skrzynkami pocztowymi.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => console.log("TODO: Gmail OAuth")}>Connect Gmail</Button>
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
