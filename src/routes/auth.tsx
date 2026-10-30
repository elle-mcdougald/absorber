import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { DotPattern, TwoTone } from "@/components/absorber/graphics";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Absorber" },
      { name: "description", content: "Sign in to Absorber, your live lecture companion." },
      { property: "og:title", content: "Sign in — Absorber" },
      { property: "og:description", content: "Sign in to Absorber, your live lecture companion." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) nav({ to: "/library" }); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (s) nav({ to: "/library" }); });
    return () => data.subscription.unsubscribe();
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(false); }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <div className="card-flat relative flex min-h-80 flex-col justify-between overflow-hidden bg-teal p-8">
          <TwoTone top="Absorber" bottom="Listen. Follow. Remember." className="text-4xl" />
          <DotPattern variant={0} className="absolute -bottom-6 -right-6 size-64" />
        </div>
        <form onSubmit={submit} className="card-flat flex flex-col gap-4 bg-card p-8">
          <TwoTone top={mode === "in" ? "Welcome" : "Create"} bottom={mode === "in" ? "back" : "account"} className="text-3xl" />
          <input className="rounded-full bg-muted px-5 py-3 outline-none" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="rounded-full bg-muted px-5 py-3 outline-none" type="password" placeholder="Password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button disabled={busy} className="rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50">
            {mode === "in" ? "Sign in" : "Sign up"}
          </button>
          <button type="button" onClick={google} className="btn-circle !rounded-full py-3 font-medium">Continue with Google</button>
          <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="text-sm text-muted-foreground">
            {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
