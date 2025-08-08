import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

const ResetPassword = () => {
  useEffect(() => { document.title = "FakturBot – Reset hasła"; }, []);
  const { loading, resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await resetPasswordForEmail(email);
  };

  return (
    <main className="min-h-screen grid place-items-center bg-background">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow">
        <h1 className="text-2xl font-bold mb-1">Reset hasła</h1>
        <p className="text-sm text-muted-foreground mb-6">Wpisz swój e-mail, wyślemy link do resetu.</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            Wyślij instrukcje
          </Button>
        </form>
      </section>
    </main>
  );
};

export default ResetPassword;
