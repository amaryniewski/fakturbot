import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Bot, Mail, ScanText, FileText } from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";

export const AutomationSettings = () => {
  const { settings, loading, updateSettings } = useCompanySettings();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Automatyzacja
          </CardTitle>
          <CardDescription>Ładowanie ustawień...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Automatyzacja
        </CardTitle>
        <CardDescription>
          Skonfiguruj automatyczne procesy dla swojej firmy
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" />
              Automatyczne pobieranie nowych maili
            </Label>
            <p className="text-sm text-muted-foreground">
              Automatycznie skanuj skrzynki pocztowe w poszukiwaniu nowych faktur
            </p>
          </div>
          <Switch
            checked={settings?.auto_import_emails || false}
            onCheckedChange={(checked) => 
              updateSettings({ auto_import_emails: checked })
            }
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2 text-base">
              <ScanText className="h-4 w-4" />
              Automatyczne OCR
            </Label>
            <p className="text-sm text-muted-foreground">
              Automatycznie uruchamiaj przetwarzanie OCR dla nowych faktur
            </p>
          </div>
          <Switch
            checked={settings?.auto_send_to_ocr || false}
            onCheckedChange={(checked) => 
              updateSettings({ auto_send_to_ocr: checked })
            }
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Automatyczne wysyłanie do księgowości
            </Label>
            <p className="text-sm text-muted-foreground">
              Automatycznie wysyłaj przetworzone faktury do systemu księgowego
            </p>
          </div>
          <Switch
            checked={settings?.auto_send_to_accounting || false}
            onCheckedChange={(checked) => 
              updateSettings({ auto_send_to_accounting: checked })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
};