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
        const code = search.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            toast({ title: "Błąd autoryzacji", description: error.message });
          }
        } else {
          // Obsługa linków z hash (#access_token, #type=recovery)
          const { error } = await (supabase.auth as any).getSessionFromUrl({ storeSession: true });
          if (error) {
            toast({ title: "Błąd autoryzacji", description: error.message });
          }
        }
      } catch (e: any) {
        toast({ title: "Błąd", description: e?.message || String(e) });
      } finally {
        setLoading(false);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const typeFromHash = hashParams.get("type");
        if (type === "recovery" || typeFromHash === "recovery") setRecovery(true);
        else navigate("/app", { replace: true });
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
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast({ title: "Błąd", description: error.message });
      return;
    }
    toast({ title: "Hasło ustawione", description: "Możesz kontynuować." });
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
