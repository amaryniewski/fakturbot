// src/components/ksef/KSeFConfigDialog.tsx

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle, Download, Eye, EyeOff } from 'lucide-react';
import { useKSeFConfig } from '@/hooks/ksef/useKSeFConfig';

interface KSeFConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const KSeFConfigDialog: React.FC<KSeFConfigDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { config, saveConfig, testConnection, isLoading, error, clearError } = useKSeFConfig();
  
  const [formData, setFormData] = useState({
    environment: 'test' as 'test' | 'production',
    nip: '5811870973',
    token: '',
    auto_fetch: true,
    fetch_interval_minutes: 30
  });
  
  const [showToken, setShowToken] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData({
        environment: config.environment,
        nip: config.nip,
        token: '', // Never show the actual token
        auto_fetch: config.auto_fetch,
        fetch_interval_minutes: config.fetch_interval_minutes
      });
    }
  }, [config]);

  useEffect(() => {
    if (open) {
      clearError();
      setTestStatus('idle');
    }
  }, [open, clearError]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      clearError();
      
      // Validate form
      if (!formData.nip || formData.nip.length !== 10) {
        throw new Error('NIP musi mieć dokładnie 10 cyfr');
      }
      
      if (!formData.token && !config) {
        throw new Error('Token jest wymagany');
      }

      const dataToSave: any = {
        environment: formData.environment,
        nip: formData.nip,
        auto_fetch: formData.auto_fetch,
        fetch_interval_minutes: formData.fetch_interval_minutes
      };

      // Only include token if it was changed
      if (formData.token) {
        dataToSave.token = formData.token;
      }

      await saveConfig(dataToSave);
      
      // Clear token from form after saving
      setFormData(prev => ({ ...prev, token: '' }));
      
      onOpenChange(false);
    } catch (err) {
      // Error is handled by the hook
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTestStatus('testing');
      clearError();
      await testConnection();
      setTestStatus('success');
    } catch (err) {
      setTestStatus('error');
    }
  };

  const validateNip = (nip: string) => {
    return /^\d{10}$/.test(nip);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Konfiguracja pobierania z KSeF
          </DialogTitle>
          <DialogDescription>
            Skonfiguruj automatyczne pobieranie faktur otrzymanych przez Twoją firmę z systemu KSeF
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Environment Selection */}
          <div className="space-y-2">
            <Label htmlFor="environment">Środowisko KSeF</Label>
            <Select
              value={formData.environment}
              onValueChange={(value: 'test' | 'production') =>
                setFormData({ ...formData, environment: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Testowe (zalecane do testów)</SelectItem>
                <SelectItem value="production">Produkcyjne</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {formData.environment === 'test' 
                ? 'Środowisko testowe - bezpieczne do eksperymentowania'
                : 'Środowisko produkcyjne - rzeczywiste dane'
              }
            </p>
          </div>

          {/* NIP */}
          <div className="space-y-2">
            <Label htmlFor="nip">NIP firmy</Label>
            <Input
              id="nip"
              value={formData.nip}
              onChange={(e) => setFormData({ ...formData, nip: e.target.value.replace(/\D/g, '') })}
              placeholder="1234567890"
              maxLength={10}
              className={!validateNip(formData.nip) && formData.nip ? 'border-destructive' : ''}
            />
            <p className="text-sm text-muted-foreground">
              {formData.environment === 'test' 
                ? 'Dla środowiska testowego użyj NIP: 5811870973'
                : 'NIP firmy, dla której chcesz pobierać faktury'
              }
            </p>
            {!validateNip(formData.nip) && formData.nip && (
              <p className="text-sm text-destructive">NIP musi składać się z dokładnie 10 cyfr</p>
            )}
          </div>

          {/* Token */}
          <div className="space-y-2">
            <Label htmlFor="token">Token dostępowy KSeF</Label>
            <div className="relative">
              <Input
                id="token"
                type={showToken ? 'text' : 'password'}
                value={formData.token}
                onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                placeholder={config ? 'Pozostaw puste, aby zachować obecny token' : 'Wprowadź token z systemu KSeF'}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Token do pobierania faktur otrzymanych przez firmę. Token jest szyfrowany przed zapisaniem.
            </p>
          </div>

          {/* Fetch Settings */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fetch_interval">Interwał pobierania</Label>
                <Select
                  value={formData.fetch_interval_minutes.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, fetch_interval_minutes: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">Co 15 minut</SelectItem>
                    <SelectItem value="30">Co 30 minut</SelectItem>
                    <SelectItem value="60">Co godzinę</SelectItem>
                    <SelectItem value="120">Co 2 godziny</SelectItem>
                    <SelectItem value="240">Co 4 godziny</SelectItem>
                    <SelectItem value="480">Co 8 godzin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Automatyczne pobieranie</Label>
                <p className="text-sm text-muted-foreground">
                  Automatycznie pobieraj nowe faktury w określonych interwałach
                </p>
              </div>
              <Switch
                checked={formData.auto_fetch}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, auto_fetch: checked })
                }
              />
            </div>
          </div>

          {/* Connection Test */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Test połączenia</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing' || !formData.nip || !validateNip(formData.nip)}
              >
                {testStatus === 'testing' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Testuj
              </Button>
            </div>
            
            {testStatus === 'success' && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>Połączenie z KSeF działa poprawnie</AlertDescription>
              </Alert>
            )}
            
            {testStatus === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Nie udało się połączyć z KSeF. Sprawdź konfigurację.</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Information */}
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg">
            <h4 className="font-medium text-primary mb-2">Informacje o bezpieczeństwie</h4>
            <ul className="text-sm text-primary/80 space-y-1">
              <li>• Token jest szyfrowany przed zapisaniem w bazie danych</li>
              <li>• Szyfrowanie odbywa się wyłącznie po stronie serwera</li>
              <li>• Połączenie z KSeF używa protokołu HTTPS</li>
              <li>• Dane są przetwarzane zgodnie z RODO</li>
              <li>• Możesz w każdej chwili usunąć konfigurację</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || isLoading || !validateNip(formData.nip)}
          >
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Zapisz konfigurację
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};