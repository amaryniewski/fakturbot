# Gmail OAuth Integration Setup

Ta implementacja używa standardowego SaaS OAuth flow, gdzie FakturBot ma swoją aplikację OAuth w Google Cloud Console, a użytkownicy autoryzują FakturBot do dostępu do swoich kont Gmail.

## 1. Konfiguracja Google Cloud Console

### Krok 1: Utwórz projekt Google Cloud
1. Idź do [Google Cloud Console](https://console.cloud.google.com/)
2. Utwórz nowy projekt lub wybierz istniejący
3. Włącz Gmail API dla projektu

### Krok 2: Konfiguruj OAuth Consent Screen
1. W Google Cloud Console, idź do **APIs & Services > OAuth consent screen**
2. Wybierz typ aplikacji: **External**
3. Wypełnij wymagane pola:
   - **App name**: FakturBot
   - **User support email**: twój email
   - **Developer contact information**: twój email
4. W sekcji **Authorized domains** dodaj:
   - Twoja domena produkcyjna (np. `fakturbot.com`)
   - `supabase.co` (dla development)
5. W sekcji **Scopes** dodaj:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `openid`

### Krok 3: Utwórz OAuth Client ID
1. Idź do **APIs & Services > Credentials**
2. Kliknij **Create Credentials > OAuth client ID**
3. Wybierz **Web application**
4. W **Authorized JavaScript origins** dodaj:
   - `https://qlrfbaantfrqzyrunoau.supabase.co` (dla edge functions)
   - Twoja domena produkcyjna
5. W **Authorized redirect URIs** dodaj:
   - `https://qlrfbaantfrqzyrunoau.supabase.co/functions/v1/gmail-oauth`
   - Dla produkcji: `https://twoja-domena-supabase.supabase.co/functions/v1/gmail-oauth`

## 2. Konfiguracja zmiennych środowiskowych w Supabase

W Supabase Dashboard, idź do **Settings > Edge Functions** i dodaj:

- `GOOGLE_CLIENT_ID`: Client ID z Google Cloud Console
- `GOOGLE_CLIENT_SECRET`: Client Secret z Google Cloud Console

## 3. Jak to działa

1. **Użytkownik kliknie "Połącz Gmail"** w Settings
2. **Aplikacja otwiera popup** z Google OAuth URL
3. **Użytkownik autoryzuje FakturBot** do dostępu do jego Gmail
4. **Google przekierowuje** na edge function `/functions/v1/gmail-oauth`
5. **Edge function wymienia kod na tokeny** i zapisuje je w bazie danych
6. **Popup zamyka się** i informuje aplikację o sukcesie

## 4. Uprawnienia i bezpieczeństwo

- **Read-only access**: FakturBot może tylko czytać emaile, nie może ich wysyłać ani modyfikować
- **Scoped access**: Dostęp tylko do Gmail i podstawowych informacji profilu
- **Revokable**: Użytkownicy mogą cofnąć dostęp w ustawieniach Google Account
- **Encrypted storage**: Tokeny są bezpiecznie przechowywane w Supabase

## 5. Privacy Policy

Musisz dodać Privacy Policy do swojej aplikacji, która wyjaśnia:
- Jakie dane zbierasz z Gmail (tylko faktury/załączniki)
- Jak przechowujesz dane
- Że użytkownicy mogą cofnąć dostęp w każdej chwili
- Link do Privacy Policy musi być dostępny podczas OAuth flow

## 6. Production Deployment

Przed wdrożeniem na produkcję:
1. Zaktualizuj OAuth Consent Screen z prawdziwymi domenami
2. Dodaj production redirect URLs
3. Ustaw zmienne środowiskowe w production Supabase
4. Przetestuj pełny flow na staging environment

## 7. Monitoring i logs

Sprawdzaj logi edge function w Supabase Dashboard:
- **Edge Functions > gmail-oauth > Logs**
- Monitoruj błędy autoryzacji
- Sprawdzaj czy tokeny są poprawnie zapisywane

## Troubleshooting

### "redirect_uri_mismatch"
- Sprawdź czy redirect URI w Google Cloud Console dokładnie pasuje do URL edge function

### "access_denied"
- Użytkownik anulował autoryzację lub nie ma odpowiednich uprawnień

### "invalid_client"
- Błędny Client ID lub Secret w zmiennych środowiskowych