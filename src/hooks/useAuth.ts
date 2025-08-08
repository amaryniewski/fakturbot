import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

export const useAuth = () => {
  const [loading, setLoading] = useState(false);

  const signInWithPassword = async (email: string, password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast({ title: "Błąd logowania", description: error.message });
      return { error };
    }
    toast({ title: "Zalogowano", description: "Witaj ponownie!" });
    return {};
  };

  const signInWithOtp = async (email: string) => {
    setLoading(true);
    const redirectUrl = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Błąd magic link", description: error.message });
      return { error };
    }
    toast({ title: "Magic link wysłany", description: "Sprawdź skrzynkę e-mail." });
    return {};
  };

  const resetPasswordForEmail = async (email: string) => {
    setLoading(true);
    const redirectUrl = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    setLoading(false);
    if (error) {
      toast({ title: "Błąd resetu hasła", description: error.message });
      return { error };
    }
    toast({ title: "Email wysłany", description: "Sprawdź e-mail, aby zresetować hasło." });
    return {};
  };

  const updatePassword = async (password: string) => {
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast({ title: "Błąd", description: error.message });
      return { error };
    }
    toast({ title: "Hasło zaktualizowane", description: "Możesz kontynuować." });
    return {};
  };

  const signOut = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      toast({ title: "Błąd wylogowania", description: error.message });
      return { error };
    }
    toast({ title: "Wylogowano" });
    return {};
  };

  return { loading, signInWithPassword, signInWithOtp, resetPasswordForEmail, updatePassword, signOut };
};
