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

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
        <div className="card-flat relative flex min-h-80 flex-col justify-between overflow-hidden bg-teal p-8">
          <TwoTone top="Absorber" bottom="Listen. Follow. Remember." className="text-4xl" bottomClassName="text-ink/70" />
          <DotPattern variant={0} className="absolute -bottom-6 -right-6 size-64" />
        </div>
        <div className="card-flat flex flex-col gap-4 bg-card p-8">
          <TwoTone top="Welcome" bottom="back" className="text-3xl" />
          <button onClick={guest} disabled={busy} className="rounded-full bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? "Starting…" : "Start listening"}
          </button>
          <button type="button" onClick={google} className="btn-circle !rounded-full py-3 font-medium">Continue with Google</button>
          <p className="text-sm font-medium text-ink/75">
            No email or password needed — one tap and you're in. Your lectures stay on this browser; use Google to keep them across devices.
          </p>
        </div>
      </div>
    </div>
  );
}
