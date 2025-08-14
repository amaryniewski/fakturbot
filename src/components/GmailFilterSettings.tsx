import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useGmailFilterSettings } from "@/hooks/useGmailFilterSettings";
import { X, Plus } from "lucide-react";

export const GmailFilterSettings = () => {
  const { settings, loading, saveSettings } = useGmailFilterSettings();
  const [localSettings, setLocalSettings] = useState(settings);
  const [newEmailInput, setNewEmailInput] = useState("");

  const handleSave = async () => {
    await saveSettings(localSettings);
  };

  const addAllowedEmail = () => {
    if (newEmailInput.trim()) {
      const currentEmails = localSettings.allowed_sender_emails || [];
      setLocalSettings({
        ...localSettings,
        allowed_sender_emails: [...currentEmails, newEmailInput.trim()]
      });
      setNewEmailInput("");
    }
  };

  const removeAllowedEmail = (emailToRemove: string) => {
    const updatedEmails = localSettings.allowed_sender_emails?.filter(
      email => email !== emailToRemove
    ) || [];
    setLocalSettings({
      ...localSettings,
      allowed_sender_emails: updatedEmails.length > 0 ? updatedEmails : null
    });
  };

  // Update local settings when global settings change
  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ustawienia filtrów Gmail</CardTitle>
        <CardDescription>
          Konfiguruj zapytania do wyszukiwania faktur i dozwolone adresy email
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="filter-query">Zapytanie filtrujące Gmail</Label>
          <Textarea
            id="filter-query"
            value={localSettings.filter_query}
            onChange={(e) => setLocalSettings({
              ...localSettings,
              filter_query: e.target.value
            })}
            placeholder="has:attachment is:unread subject:invoice OR subject:faktura"
            className="min-h-20"
          />
          <p className="text-sm text-muted-foreground">
            Używa składni Gmail search. Domyślnie wyszukuje załączniki z tematami zawierającymi "invoice" lub "faktura".
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Dozwolone adresy email nadawców (opcjonalne)</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Jeśli ustawisz adresy, faktury będą importowane tylko od tych nadawców
            </p>
          </div>
          
          <div className="flex gap-2">
            <Input
              value={newEmailInput}
              onChange={(e) => setNewEmailInput(e.target.value)}
              placeholder="np. invoices@firma.pl"
              onKeyPress={(e) => e.key === 'Enter' && addAllowedEmail()}
            />
            <Button onClick={addAllowedEmail} size="icon" variant="outline">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {localSettings.allowed_sender_emails && localSettings.allowed_sender_emails.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {localSettings.allowed_sender_emails.map((email, index) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  {email}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => removeAllowedEmail(email)}
                  />
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Zapisywanie..." : "Zapisz ustawienia"}
        </Button>
      </CardContent>
    </Card>
  );
};