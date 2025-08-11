import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

const AuthCallback = () => {
  const [search] = useSearchParams();
  const type = useMemo(() => search.get("type"), [search]);
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    document.title = "FakturBot – Autoryzacja";
  }, []);

  useEffect(() => {
    const run = async () => {
      try {
        // Sprawdź najpierw czy to recovery (PRZED wymianą sesji)
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const typeFromHash = hashParams.get("type");
        const isRecovery = type === "recovery" || typeFromHash === "recovery";
        
        const code = search.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            toast({ title: "Błąd autoryzacji", description: error.message });
            return;
          }
        } else {
          // Obsługa linków z hash (#access_token, #refresh_token, #type=recovery)
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({ access_token, refresh_token });
            if (error) {
              toast({ title: "Błąd autoryzacji", description: error.message });
              return;
            } else {
              // Usuń wrażliwe tokeny z paska adresu
              window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            }
          } else if (!isRecovery) {
            toast({ title: "Błąd autoryzacji", description: "Brak tokenów sesji w adresie URL." });
            return;
          }
        }
        
        // Sprawdź recovery PRZED przekierowaniem
        if (isRecovery) {
          setRecovery(true);
        } else {
          navigate("/app", { replace: true });
        }
      } catch (e: any) {
        toast({ title: "Błąd", description: e?.message || String(e) });
      } finally {
        setLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Hasło zbyt krótkie", description: "Użyj co najmniej 8 znaków." });
      return;
    }
    if (password !== password2) {
      toast({ title: "Hasła nie są takie same", description: "Spróbuj ponownie." });
      return;
    }
    
    // Pobierz email z aktualnej sesji
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      toast({ title: "Błąd", description: "Nie można pobrać adresu e-mail." });
      return;
    }
    
    // Ustaw nowe hasło
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      toast({ title: "Błąd", description: updateError.message });
      return;
    }
    
    // Wyloguj się z tymczasowej sesji recovery
    await supabase.auth.signOut();
    
    // Zaloguj się z nowym hasłem aby zakończyć proces
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: password
    });
    
    if (signInError) {
      toast({ title: "Błąd logowania", description: "Hasło zostało ustawione, ale nie udało się zalogować. Spróbuj zalogować się ręcznie." });
      navigate("/login", { replace: true });
      return;
    }
    
    toast({ title: "Hasło ustawione", description: "Zostałeś zalogowany z nowym hasłem." });
    navigate("/app", { replace: true });
  };

  if (loading) return <main className="min-h-screen grid place-items-center">Ładowanie…</main>;

  if (!recovery) return null;

  return (
    <main className="min-h-screen grid place-items-center bg-background">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow">
        <h1 className="text-2xl font-bold mb-1">Ustaw nowe hasło</h1>
        <p className="text-sm text-muted-foreground mb-6">Wpisz nowe hasło do konta.</p>
        <form onSubmit={onSetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password2">Powtórz hasło</Label>
            <Input id="password2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full">Zapisz i przejdź</Button>
        </form>
      </section>
    </main>
  );
};

export default AuthCallback;
