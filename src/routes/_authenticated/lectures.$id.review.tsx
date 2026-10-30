import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { extractMainIdeas, illustrateIdea } from "@/lib/ai.functions";
import { fmtClock, fmtShort, pad2, signPaths } from "@/lib/absorber";
import { StickyNote, type Note } from "@/components/absorber/StickyNote";
import { Dial, DotPattern, Rings, TwoTone } from "@/components/absorber/graphics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/lectures/$id/review")({
  head: () => ({
    meta: [
      { title: "Lecture Review — Absorber" },
      { name: "description", content: "Main ideas, illustrations, slides, transcript, and your notes from the lecture." },
      { property: "og:title", content: "Lecture Review — Absorber" },
      { property: "og:description", content: "Main ideas, illustrations, slides, transcript, and your notes." },
    ],
  }),
  component: Review,
});

type Slide = { id: string; slide_number: number; image_url: string | null };
type Seg = { id: string; text: string; start_time: number; matched_slide_id: string | null };
type Idea = { id: string; title: string; summary: string; related_slide_ids: string[]; image_url: string | null; position: number };

function Review() {
  const { id } = Route.useParams();
  const extractFn = useServerFn(extractMainIdeas);
  const illustrateFn = useServerFn(illustrateIdea);
  const [lecture, setLecture] = useState<{ title: string; status: string; duration: number } | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [segs, setSegs] = useState<Seg[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<string>("");
  const [drawing, setDrawing] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const started = useRef(false);

  async function loadIdeas() {
    const { data } = await supabase.from("main_ideas").select("*").eq("lecture_id", id).order("position");
    const list = (data ?? []) as Idea[];
    setIdeas(list);
    const signed = await signPaths(list.map((i) => i.image_url));
    setUrls((u) => ({ ...u, ...signed }));
    return list;
  }

  async function generate() {
    setPhase("Finding the main ideas…");
    try {
      const { ideas: made } = await extractFn({ data: { lectureId: id } });
      await loadIdeas();
      setPhase("Drawing illustrations…");
      setDrawing(new Set(made.map((m) => m.id)));
      await Promise.all(made.map(async (m) => {
        try {
          const { path } = await illustrateFn({ data: { ideaId: m.id, metaphor: m.metaphor } });
          const signed = await signPaths([path]);
          setUrls((u) => ({ ...u, ...signed }));
          setIdeas((list) => list.map((i) => (i.id === m.id ? { ...i, image_url: path } : i)));
        } catch (e) { toast.error((e as Error).message); }
        finally { setDrawing((d) => { const n = new Set(d); n.delete(m.id); return n; }); }
      }));
      await supabase.from("lectures").update({ status: "complete" }).eq("id", id);
      setLecture((l) => (l ? { ...l, status: "complete" } : l));
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setPhase(""); }
  }

  useEffect(() => {
    (async () => {
      const [l, s, t, n] = await Promise.all([
        supabase.from("lectures").select("title,status,duration").eq("id", id).single(),
        supabase.from("slides").select("id,slide_number,image_url").eq("lecture_id", id).order("slide_number"),
        supabase.from("transcript_segments").select("id,text,start_time,matched_slide_id").eq("lecture_id", id).order("start_time"),
        supabase.from("notes").select("*").eq("lecture_id", id).order("timestamp"),
      ]);
      setLecture(l.data);
      setSlides(s.data ?? []);
      setSegs(t.data ?? []);
      setNotes((n.data ?? []) as Note[]);
      setUrls(await signPaths((s.data ?? []).map((x) => x.image_url)));
      const existing = await loadIdeas();
      if (!started.current && (l.data?.status === "processing" || existing.length === 0) && ((t.data?.length ?? 0) > 0 || (s.data?.length ?? 0) > 0)) {
        started.current = true;
        generate();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const query = q.trim().toLowerCase();
  const segMatch = (s: Seg) => !query || s.text.toLowerCase().includes(query);
  const noteMatch = (n: Note) => !query || n.text.toLowerCase().includes(query);

  // group by slide; unmatched content goes under "Unassigned"
  const groups = useMemo(() => {
    const g = slides.map((sl) => ({ slide: sl as Slide | null, key: sl.id, segs: segs.filter((s) => s.matched_slide_id === sl.id), notes: notes.filter((n) => n.slide_id === sl.id) }));
    const orphanSegs = segs.filter((s) => !s.matched_slide_id || !slides.some((x) => x.id === s.matched_slide_id));
    const orphanNotes = notes.filter((n) => !n.slide_id || !slides.some((x) => x.id === n.slide_id));
    if (orphanSegs.length || orphanNotes.length) g.push({ slide: null, key: "none", segs: orphanSegs, notes: orphanNotes });
    return g;
  }, [slides, segs, notes]);

  const visibleGroups = query ? groups.filter((g) => g.segs.some(segMatch) || g.notes.some(noteMatch)) : groups;

  async function redrawIdea(idea: Idea) {
    setDrawing((d) => new Set(d).add(idea.id));
    try {
      const { path } = await illustrateFn({ data: { ideaId: idea.id, metaphor: idea.title } });
      const signed = await signPaths([path]);
      setUrls((u) => ({ ...u, ...signed }));
      setIdeas((list) => list.map((i) => (i.id === idea.id ? { ...i, image_url: path } : i)));
    } catch (e) { toast.error((e as Error).message); }
    finally { setDrawing((d) => { const n = new Set(d); n.delete(idea.id); return n; }); }
  }

  function jumpTo(elId: string, openKey?: string) {
    if (openKey) setOpen((o) => new Set(o).add(openKey));
    setHighlight(elId);
    setTimeout(() => document.getElementById(elId)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    setTimeout(() => setHighlight(null), 1700);
  }

  function hlText(text: string) {
    if (!query) return text;
    const i = text.toLowerCase().indexOf(query);
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark className="rounded bg-orange/40 px-0.5">{text.slice(i, i + query.length)}</mark>{text.slice(i + query.length)}</>;
  }

  const slideNum = (sid: string | null) => slides.find((s) => s.id === sid)?.slide_number;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 md:px-10">
      <div className="flex items-center justify-between gap-4">
        <Link to="/library" className="btn-circle size-11"><ArrowLeft className="size-4" /></Link>
        <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 shadow-button">
          <Search className="size-4 text-ink-soft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transcript & notes" className="w-48 bg-transparent outline-none md:w-72" />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
        <TwoTone top={lecture?.title ?? "…"} bottom="Review" className="text-5xl md:text-6xl" />
        <div className="flex gap-8">
          <p className="flex items-baseline gap-1"><span className="num text-5xl">{fmtClock(lecture?.duration ?? 0).slice(3)}</span><span className="text-xs text-ink-soft">Min</span></p>
          <p className="flex items-baseline gap-1"><span className="num text-5xl">{pad2(notes.length)}</span><span className="text-xs text-ink-soft">Notes</span></p>
          <p className="flex items-baseline gap-1"><span className="num text-5xl">{pad2(slides.length)}</span><span className="text-xs text-ink-soft">Slides</span></p>
        </div>
      </div>

      {/* Main ideas */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Main ideas</p>
          {!phase && ideas.length > 0 && (
            <button onClick={generate} className="flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink"><RefreshCw className="size-3" /> Regenerate</button>
          )}
        </div>
        {phase && ideas.length === 0 ? (
          <div className="card-flat mt-4 flex items-center gap-6 bg-card p-8">
            <Rings className="size-20 animate-spin [animation-duration:4s]" />
            <div><p className="headline text-2xl">Processing your lecture</p><p className="text-ink-soft">{phase}</p></div>
          </div>
        ) : (
          <div className="mt-4 flex snap-x gap-5 overflow-x-auto pb-4">
            {ideas.map((idea, i) => (
              <button
                key={idea.id}
                onClick={() => idea.related_slide_ids[0] && jumpTo(`slide-${idea.related_slide_ids[0]}`)}
                className="card-flat animate-fade-up flex w-80 shrink-0 snap-start flex-col overflow-hidden bg-card text-left transition-transform hover:-translate-y-1"
              >
                <div className="relative grid aspect-square place-items-center bg-muted">
                  {idea.image_url && urls[idea.image_url] ? (
                    <img src={urls[idea.image_url]} alt={idea.title} className="size-full object-cover" />
                  ) : drawing.has(idea.id) ? (
                    <Dial className="size-24 animate-pulse" />
                  ) : (
                    <DotPattern variant={i} className="size-28" />
                  )}
                  <span className="num absolute left-4 top-3 text-3xl">{pad2(i + 1)}</span>
                </div>
                <div className="p-5">
                  <h3 className="headline text-xl">{idea.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-soft">{idea.summary}</p>
                  {idea.related_slide_ids.length > 0 && (
                    <p className="mt-3 text-xs font-semibold">Slides {idea.related_slide_ids.map((s) => pad2(slideNum(s) ?? 0)).join(", ")}</p>
                  )}
                </div>
              </button>
            ))}
            {!phase && ideas.length === 0 && <p className="text-ink-soft">No main ideas yet — record some of the lecture first.</p>}
          </div>
        )}
      </section>

      {/* Slides */}
      <section className="mt-10 space-y-6">
        {visibleGroups.map((g) => {
          const isOpen = open.has(g.key) || !!query;
          return (
            <article id={g.slide ? `slide-${g.slide.id}` : "slide-none"} key={g.key} className={cn("card-flat grid gap-6 bg-card p-6 lg:grid-cols-[1.6fr_1fr]", highlight === `slide-${g.key}` && "highlight-pulse")}>
              <div>
                <p className="flex items-baseline gap-1"><span className="num text-4xl">{g.slide ? pad2(g.slide.slide_number) : "—"}</span><span className="text-xs text-ink-soft">{g.slide ? "Slide" : "Unassigned"}</span></p>
                {g.slide?.image_url && urls[g.slide.image_url] && (
                  <img src={urls[g.slide.image_url]} alt={`Slide ${g.slide.slide_number}`} loading="lazy" className="mt-3 w-full rounded-xl bg-muted object-contain" />
                )}
                <button onClick={() => setOpen((o) => { const n = new Set(o); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })} className="mt-4 flex items-center gap-2 text-sm font-semibold">
                  <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                  Transcript <span className="text-ink-soft">({g.segs.length})</span>
                </button>
                {isOpen && (
                  <div className="mt-3 space-y-3 text-sm leading-relaxed">
                    {g.segs.filter(segMatch).map((s) => (
                      <p key={s.id} id={`seg-${s.id}`} className={cn("rounded-lg p-1 transition-colors", highlight === `seg-${s.id}` && "highlight-pulse bg-orange/15")}>
                        <button onClick={() => jumpTo(`seg-${s.id}`, g.key)} className="mr-2 font-mono text-[11px] text-ink-soft hover:text-ink">{fmtShort(s.start_time)}</button>
                        {hlText(s.text)}
                      </p>
                    ))}
                    {g.segs.length === 0 && <p className="text-ink-soft">Nothing was said on this slide.</p>}
                  </div>
                )}
              </div>
              <div className="grid content-start grid-cols-2 gap-4 p-2">
                {g.notes.filter(noteMatch).map((n) => (
                  <div key={n.id} id={`note-${n.id}`} className={cn(highlight === `note-${n.id}` && "highlight-pulse rounded-md")}>
                    <StickyNote
                      note={{ ...n, text: n.text }}
                      slideNumber={slideNum(n.slide_id)}
                      onClick={() => {
                        const near = g.segs.reduce<Seg | null>((best, s) => (s.start_time <= n.timestamp && (!best || s.start_time > best.start_time) ? s : best), null);
                        if (near) jumpTo(`seg-${near.id}`, g.key); else jumpTo(`note-${n.id}`);
                      }}
                    />
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
