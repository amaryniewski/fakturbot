import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

const Login = () => {
  useEffect(() => {
    document.title = "FakturBot – Logowanie";
  }, []);
  const navigate = useNavigate();
  const { loading, signInWithPassword, signInWithOtp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const onPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await signInWithPassword(email, password);
    if (!error) navigate("/app", { replace: true });
  };

  const onMagicLink = async () => {
    await signInWithOtp(email);
  };

  return (
    <main className="min-h-screen grid place-items-center bg-background">
      <section className="w-full max-w-md rounded-lg border bg-card p-6 shadow">
        <h1 className="text-2xl font-bold mb-1">Zaloguj się</h1>
        <p className="text-sm text-muted-foreground mb-6">Rejestracja tylko przez zaproszenia.</p>
        <form onSubmit={onPasswordLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Hasło</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            Zaloguj się
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" onClick={onMagicLink} disabled={loading}>
            Wyślij magic link
          </Button>
          <Link to="/reset-password" className="text-sm text-primary underline">Nie pamiętasz hasła?</Link>
        </div>
      </section>
    </main>
  );
};

export default Login;
