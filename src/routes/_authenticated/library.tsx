import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DotPattern, TwoTone } from "@/components/absorber/graphics";
import { fmtClock } from "@/lib/absorber";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Your Lectures — Absorber" },
      { name: "description", content: "All your recorded lectures this semester, organised by course." },
      { property: "og:title", content: "Your Lectures — Absorber" },
      { property: "og:description", content: "All your recorded lectures this semester, organised by course." },
    ],
  }),
  component: Library,
});

function Library() {
  const [tab, setTab] = useState<string>("all");
  const { data } = useQuery({
    queryKey: ["library"],
    queryFn: async () => {
      const [c, l] = await Promise.all([
        supabase.from("courses").select("*").order("created_at"),
        supabase.from("lectures").select("*").order("date", { ascending: false }),
      ]);
      return { courses: c.data ?? [], lectures: l.data ?? [] };
    },
  });
  const courses = data?.courses ?? [];
  const lectures = (data?.lectures ?? []).filter((l) => tab === "all" || l.course_id === tab);
  const colorOf = (id: string) => courses.find((c) => c.id === id)?.color ?? "#FFFFFF";

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 md:px-10">
      <header className="flex items-start justify-between gap-6">
        <TwoTone top="Your Lectures" bottom="This Semester" className="text-5xl md:text-7xl" />
        <div className="flex items-center gap-3">
          <Link to="/lectures/new" className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
            <Plus className="size-4" /> New Lecture
          </Link>
          <button aria-label="Sign out" onClick={() => supabase.auth.signOut()} className="btn-circle size-11">
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <nav className="mt-10 flex gap-6 overflow-x-auto pb-2 text-lg font-semibold">
        {[{ id: "all", name: "All" }, ...courses].map((c) => (
          <button key={c.id} onClick={() => setTab(c.id)} className={cn("whitespace-nowrap transition-colors", tab === c.id ? "text-ink" : "text-ink-soft/70 hover:text-ink-soft")}>
            {c.name}
          </button>
        ))}
      </nav>

      <section className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {lectures.map((l, i) => {
          const to = l.status === "complete" || l.status === "processing" ? "/lectures/$id/review" : l.status === "live" ? "/lectures/$id/live" : "/lectures/$id/live";
          return (
            <Link key={l.id} to={to} params={{ id: l.id }} className="card-flat animate-fade-up relative flex aspect-[4/5] flex-col justify-between overflow-hidden p-6 transition-transform hover:-translate-y-1" style={{ background: colorOf(l.course_id) }}>
              <h3 className="headline max-w-[85%] text-2xl text-ink">{l.title}</h3>
              <DotPattern variant={i} className="mx-auto size-40" />
              <div className="flex items-end justify-between text-xs text-ink/50">
                <span>{format(new Date(l.date), "MMM d")}</span>
                <span className="font-mono">{l.status === "complete" ? fmtClock(l.duration) : l.status}</span>
              </div>
            </Link>
          );
        })}
        {lectures.length === 0 && (
          <Link to="/lectures/new" className="card-flat flex aspect-[4/5] flex-col items-center justify-center gap-4 bg-card/60 text-ink-soft">
            <Plus className="size-10" />
            <span className="font-semibold">Record your first lecture</span>
          </Link>
        )}
      </section>
    </div>
  );
}
