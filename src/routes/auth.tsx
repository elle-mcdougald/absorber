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
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sentConfirm, setSentConfirm] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) nav({ to: "/library" }); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { if (s) nav({ to: "/library" }); });
    return () => data.subscription.unsubscribe();
  }, [nav]);

  async function guest() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setSentConfirm(true);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <div className="card-flat relative flex min-h-80 flex-col justify-between overflow-hidden bg-teal p-8">
          <TwoTone top="Absorber" bottom="Listen. Follow. Remember." className="text-4xl" bottomClassName="text-ink/70" />
          <DotPattern variant={0} className="absolute -bottom-6 -right-6 size-64" />
        </div>
        <div className="card-flat flex flex-col gap-4 bg-card p-8">
          <TwoTone top="Welcome" bottom="back" className="text-3xl" />
          {sentConfirm ? (
            <p className="text-sm font-medium text-ink/75">
              Check your email — we sent you a confirmation link. Click it to finish signing up.
            </p>
          ) : (
            <form onSubmit={submitEmail} className="flex flex-col gap-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="rounded-full bg-background px-5 py-3 text-sm outline-none placeholder:text-ink/50"
              />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="rounded-full bg-background px-5 py-3 text-sm outline-none placeholder:text-ink/50"
              />
              <button type="submit" disabled={busy} className="rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50">
                {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-sm font-medium text-ink/75 hover:text-ink"
              >
                {mode === "signin" ? "No account? Sign up" : "Have an account? Sign in"}
              </button>
            </form>
          )}
          <button onClick={guest} disabled={busy} className="btn-circle !rounded-full py-3 font-medium disabled:opacity-50">
            {busy ? "Starting…" : "Continue as guest"}
          </button>
          <button type="button" onClick={google} className="btn-circle !rounded-full py-3 font-medium">Continue with Google</button>
          <p className="text-sm font-medium text-ink/75">
            Guest sessions stay on this browser; use email or Google to keep your lectures across devices.
          </p>
        </div>
      </div>
    </div>
  );
}
