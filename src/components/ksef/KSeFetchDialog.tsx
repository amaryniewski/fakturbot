// src/components/ksef/KSeFetchDialog.tsx

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Download, Loader2 } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import { KSEF_SUBJECT_TYPES, KSeFSubjectType } from '@/types/ksef/api';
import { cn } from '@/lib/utils';

interface KSeFetchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFetch: (dateFrom?: string, dateTo?: string, subjectType?: KSeFSubjectType) => Promise<void>;
  isLoading: boolean;
}

export const KSeFetchDialog: React.FC<KSeFetchDialogProps> = ({
  open,
  onOpenChange,
  onFetch,
  isLoading
}) => {
  const [dateFrom, setDateFrom] = useState<Date>();
  const [dateTo, setDateTo] = useState<Date>();
  const [subjectType, setSubjectType] = useState<KSeFSubjectType>('subject1');
  const [quickRange, setQuickRange] = useState<string>('');

  const handleQuickRangeChange = (range: string) => {
    setQuickRange(range);
    const today = new Date();
    
    switch (range) {
      case '7days':
        setDateFrom(subDays(today, 7));
        setDateTo(today);
        break;
      case '30days':
        setDateFrom(subDays(today, 30));
        setDateTo(today);
        break;
      case '90days':
        setDateFrom(subDays(today, 90));
        setDateTo(today);
        break;
      case 'thisMonth':
        setDateFrom(new Date(today.getFullYear(), today.getMonth(), 1));
        setDateTo(today);
        break;
      case 'lastMonth':
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        setDateFrom(lastMonth);
        setDateTo(lastMonthEnd);
        break;
      case 'custom':
        // Keep current dates
        break;
      default:
        setDateFrom(undefined);
        setDateTo(undefined);
    }
  };

  const handleFetch = async () => {
    // Convert dates to YYYY-MM-DD format in UTC
    const dateFromStr = dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined;
    const dateToStr = dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined;
    
    await onFetch(dateFromStr, dateToStr, subjectType);
    onOpenChange(false);
  };

  const getSubjectTypeDescription = (type: string) => {
    return KSEF_SUBJECT_TYPES[type as keyof typeof KSEF_SUBJECT_TYPES] || '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Pobierz faktury z KSeF
          </DialogTitle>
          <DialogDescription>
            Wybierz zakres dat i typ faktur do pobrania z systemu KSeF
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Subject Type */}
          <div className="space-y-2">
            <Label>Typ faktur</Label>
            <Select
              value={subjectType}
              onValueChange={(value: KSeFSubjectType) => setSubjectType(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="subject1">Faktury otrzymane (subject1)</SelectItem>
                <SelectItem value="subject2">Faktury wystawione (subject2)</SelectItem>
                <SelectItem value="subject3">Wszystkie faktury (subject3)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {getSubjectTypeDescription(subjectType)}
            </p>
          </div>

          {/* Quick Date Range */}
          <div className="space-y-2">
            <Label>Szybki wybór zakresu</Label>
            <Select value={quickRange} onValueChange={handleQuickRangeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz zakres lub ustaw własny" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Bez ograniczeń (ostatnie 30 dni)</SelectItem>
                <SelectItem value="7days">Ostatnie 7 dni</SelectItem>
                <SelectItem value="30days">Ostatnie 30 dni</SelectItem>
                <SelectItem value="90days">Ostatnie 90 dni</SelectItem>
                <SelectItem value="thisMonth">Bieżący miesiąc</SelectItem>
                <SelectItem value="lastMonth">Poprzedni miesiąc</SelectItem>
                <SelectItem value="custom">Własny zakres</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Date Range */}
          {(quickRange === 'custom' || dateFrom || dateTo) && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data od</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateFrom && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? (
                        format(dateFrom, 'dd.MM.yyyy', { locale: pl })
                      ) : (
                        <span>Wybierz datę</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateFrom}
                      onSelect={setDateFrom}
                      initialFocus
                      locale={pl}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Data do</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateTo && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? (
                        format(dateTo, 'dd.MM.yyyy', { locale: pl })
                      ) : (
                        <span>Wybierz datę</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dateTo}
                      onSelect={setDateTo}
                      initialFocus
                      locale={pl}
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {/* Information */}
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg">
            <h4 className="font-medium text-primary mb-2">Informacje o pobieraniu</h4>
            <ul className="text-sm text-primary/80 space-y-1">
              <li>• Jeśli nie wybierzesz dat, pobrane zostaną faktury z ostatnich 30 dni</li>
              <li>• Proces może potrwać kilka minut w zależności od ilości faktur</li>
              <li>• Duplikaty są automatycznie wykrywane i pomijane</li>
              <li>• Faktury będą oznaczone tagiem "KSeF" w aplikacji</li>
              <li>• Operacja jest bezpieczna - można ją powtarzać bez obaw</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={handleFetch} disabled={isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Download className="w-4 h-4 mr-2" />
            Pobierz faktury
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
