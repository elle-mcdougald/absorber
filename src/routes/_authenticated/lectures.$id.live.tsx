import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Square, Mic, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { embed, transcribeChunk } from "@/lib/ai.functions";
import { fmtClock, fmtShort, NOTE_COLORS, pad2, pickSlide, signPaths } from "@/lib/absorber";
import { StickyNote, type Note } from "@/components/absorber/StickyNote";
import { Barcode } from "@/components/absorber/Barcode";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/lectures/$id/live")({
  head: () => ({
    meta: [
      { title: "Live Session — Absorber" },
      { name: "description", content: "Live transcript, current slide, and your sticky-note thoughts." },
      { property: "og:title", content: "Live Session — Absorber" },
      { property: "og:description", content: "Live transcript, current slide, and your sticky-note thoughts." },
    ],
  }),
  component: LiveSession,
});

type Slide = { id: string; slide_number: number; image_url: string | null; text: string; embedding: number[] | null };
type Seg = { id: string; text: string; start_time: number; end_time: number; matched_slide_id: string | null };

const CHUNK_MS = 5000;
const MATCH_EVERY = 20;
const MANUAL_PAUSE_MS = 60_000;
const TEXT_SIZES = ["text-base", "text-lg", "text-xl"];

function LiveSession() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const transcribeFn = useServerFn(transcribeChunk);
  const embedFn = useServerFn(embed);

  const [title, setTitle] = useState("");
  const [slides, setSlides] = useState<Slide[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(true);
  const [manualUntil, setManualUntil] = useState(0);
  const [segs, setSegs] = useState<Seg[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [activity, setActivity] = useState<number[]>([]);
  const [state, setState] = useState<"idle" | "recording" | "paused" | "ending">("idle");
  const [draft, setDraft] = useState("");
  const [noteType, setNoteType] = useState<"thought" | "question">("thought");
  const [textSize, setTextSize] = useState(0);
  const [now, setNow] = useState(Date.now());

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunkTimer = useRef<number | null>(null);
  const tickTimer = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const levelRef = useRef(0);
  const elapsedRef = useRef(0);
  const idxRef = useRef(0);
  const slidesRef = useRef<Slide[]>([]);
  const segsRef = useRef<Seg[]>([]);
  const stateRef = useRef(state);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  idxRef.current = idx; slidesRef.current = slides; segsRef.current = segs; stateRef.current = state;

  // Load lecture data
  useEffect(() => {
    (async () => {
      const [l, s, t, n] = await Promise.all([
        supabase.from("lectures").select("*").eq("id", id).single(),
        supabase.from("slides").select("*").eq("lecture_id", id).order("slide_number"),
        supabase.from("transcript_segments").select("id,text,start_time,end_time,matched_slide_id").eq("lecture_id", id).order("start_time"),
        supabase.from("notes").select("*").eq("lecture_id", id).order("created_at"),
      ]);
      if (l.data?.status === "complete" || l.data?.status === "processing") { nav({ to: "/lectures/$id/review", params: { id } }); return; }
      setTitle(l.data?.title ?? "");
      const sl = (s.data ?? []) as unknown as Slide[];
      setSlides(sl);
      setUrls(await signPaths(sl.map((x) => x.image_url)));
      setSegs((t.data ?? []) as Seg[]);
      setNotes((n.data ?? []) as Note[]);
      const resumeAt = l.data?.duration ?? 0;
      elapsedRef.current = resumeAt; setElapsed(resumeAt);
    })();
  }, [id, nav]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [segs]);

  const currentSlide = slides[idx];

  // ---------- Audio capture ----------
  const sendChunk = useCallback(async (blob: Blob, start: number, end: number) => {
    const fd = new FormData();
    const type = ((blob.type || "audio/webm").split(";")[0] ?? "audio/webm").replace("video/", "audio/");
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    fd.append("file", new Blob([blob], { type }), `chunk.${ext}`);
    fd.append("name", `chunk.${ext}`);
    try {
      const { text } = await transcribeFn({ data: fd });
      if (!text) return;
      const slideId = slidesRef.current[idxRef.current]?.id ?? null;
      const { data, error } = await supabase.from("transcript_segments")
        .insert({ lecture_id: id, text, start_time: start, end_time: end, matched_slide_id: slideId })
        .select("id,text,start_time,end_time,matched_slide_id").single();
      if (error) throw error;
      setSegs((prev) => [...prev, data as Seg].sort((a, b) => a.start_time - b.start_time));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id, transcribeFn]);

  const recordChunk = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || stateRef.current !== "recording") return;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const parts: Blob[] = [];
    const start = elapsedRef.current;
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(parts, { type: rec.mimeType });
      sendChunk(blob, start, elapsedRef.current);
      if (stateRef.current === "recording") recordChunk();
    };
    rec.start();
    recRef.current = rec;
    chunkTimer.current = window.setTimeout(() => rec.state !== "inactive" && rec.stop(), CHUNK_MS);
  }, [sendChunk]);

  const startTimers = useCallback(() => {
    tickTimer.current = window.setInterval(() => {
      // sample audio level for activity barcode
      const an = analyserRef.current;
      if (an) {
        const buf = new Uint8Array(an.fftSize);
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        levelRef.current = Math.min(1, Math.sqrt(sum / buf.length) * 6);
      }
      const sec = Math.floor(elapsedRef.current);
      setActivity((a) => { const n = [...a]; n[sec] = levelRef.current; return n; });
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current % 15 === 0) supabase.from("lectures").update({ duration: Math.floor(elapsedRef.current) }).eq("id", id).then();
    }, 1000);
  }, [id]);

  const stopTimers = () => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (chunkTimer.current) clearTimeout(chunkTimer.current);
  };

  async function begin() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      analyserRef.current = an; audioCtxRef.current = ctx;
      stateRef.current = "recording"; setState("recording");
      startTimers();
      recordChunk();
    } catch {
      toast.error("Microphone access is needed to transcribe the lecture.");
    }
  }

  function togglePause() {
    if (state === "recording") {
      stateRef.current = "paused"; setState("paused");
      stopTimers();
      if (recRef.current?.state === "recording") recRef.current.stop();
    } else if (state === "paused") {
      stateRef.current = "recording"; setState("recording");
      startTimers();
      recordChunk();
    } else if (state === "idle") begin();
  }

  async function end() {
    if (!confirm("End this session and generate your review?")) return;
    stateRef.current = "ending"; setState("ending");
    stopTimers();
    if (recRef.current?.state === "recording") recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    // give the final chunk a moment to upload
    await new Promise((r) => setTimeout(r, 4000));
    await supabase.from("lectures").update({ status: "processing", duration: Math.floor(elapsedRef.current) }).eq("id", id);
    nav({ to: "/lectures/$id/review", params: { id } });
  }

  useEffect(() => () => {
    stateRef.current = "ending";
    stopTimers();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
  }, []);

  // ---------- Slide matching ----------
  const autoActive = auto && now >= manualUntil;
  useEffect(() => {
    if (state !== "recording" || !autoActive || elapsed === 0 || elapsed % MATCH_EVERY !== 0) return undefined;
    const recent = segsRef.current.filter((s) => s.end_time >= elapsedRef.current - 60).map((s) => s.text).join(" ").trim();
    if (recent.split(/\s+/).length < 8 || slidesRef.current.length < 2) return undefined;
    embedFn({ data: { texts: [recent] } }).then(({ embeddings }) => {
      if (Date.now() < manualUntil) return;
      const q = embeddings[0]; if (!q) return;
      const next = pickSlide(q, slidesRef.current, idxRef.current);
      if (next !== idxRef.current) setIdx(next);
    }).catch(() => {});
    return undefined;
  }, [elapsed, state, autoActive, embedFn, manualUntil]);

  function manual(delta: number) {
    setIdx((i) => Math.max(0, Math.min(slides.length - 1, i + delta)));
    setManualUntil(Date.now() + MANUAL_PAUSE_MS);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") manual(1);
      if (e.key === "ArrowLeft") manual(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Notes ----------
  async function saveNote() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const sentences = segsRef.current.map((s) => s.text).join(" ").match(/[^.!?]+[.!?]*/g) ?? [];
    const snippet = sentences.slice(-2).join(" ").trim();
    const { data, error } = await supabase.from("notes").insert({
      lecture_id: id, text, timestamp: elapsedRef.current, slide_id: currentSlide?.id ?? null,
      transcript_snippet: snippet || null, type: noteType, color: NOTE_COLORS[noteType],
    }).select().single();
    if (error) return toast.error(error.message);
    setNotes((n) => [...n, data as Note]);
    setFreshIds((f) => new Set(f).add(data.id));
  }

  const slideNum = (sid: string | null) => slides.find((s) => s.id === sid)?.slide_number;
  const latestSegId = segs[segs.length - 1]?.id;
  const manualLeft = Math.max(0, Math.ceil((manualUntil - now) / 1000));
  const total = Math.max(90 * 60, elapsed + 10 * 60);
  const notesShown = useMemo(() => [...notes].reverse(), [notes]);

  return (
    <div className="flex h-screen flex-col gap-4 bg-session p-4 lg:p-5">
      <header className="flex items-center gap-3">
        <Link to="/library" className="btn-circle size-10"><ArrowLeft className="size-4" /></Link>
        <h1 className="headline truncate text-xl">{title}</h1>
        <span className={cn("ml-auto flex items-center gap-2 rounded-full bg-card px-3 py-1 text-xs font-semibold", state === "recording" ? "text-ink" : "text-ink-soft")}>
          <span className={cn("size-2 rounded-full", state === "recording" ? "animate-pulse bg-orange" : "bg-ink-soft")} />
          {state === "recording" ? "Listening" : state === "paused" ? "Paused" : state === "ending" ? "Wrapping up…" : "Ready"}
        </span>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(220px,1fr)_minmax(0,2.2fr)_minmax(220px,1fr)] gap-4">
        {/* Transcript */}
        <section className="card-flat flex min-h-0 flex-col bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Transcript</p>
          <div className={cn("mt-3 flex-1 space-y-4 overflow-y-auto pr-1 leading-relaxed", TEXT_SIZES[textSize])}>
            {segs.length === 0 && <p className="text-ink-soft">{state === "idle" ? "Press play to start listening." : "Listening… the first words appear in a few seconds."}</p>}
            {segs.map((s) => {
              const isCurrent = s.matched_slide_id === currentSlide?.id;
              const isLatest = s.id === latestSegId;
              return (
                <div key={s.id} className={cn("transition-colors duration-700", isCurrent || isLatest ? "text-ink" : "text-ink-soft/70")}>
                  <span className="mr-2 font-mono text-[10px] text-ink-soft">{fmtShort(s.start_time)}</span>
                  {isLatest ? s.text.split(" ").map((w, i) => (
                    <span key={i} className="animate-fade-up inline-block" style={{ animationDelay: `${i * 60}ms` }}>{w}&nbsp;</span>
                  )) : s.text}
                </div>
              );
            })}
            <div ref={transcriptEnd} />
          </div>
        </section>

        {/* Slide */}
        <section className="card-flat flex min-h-0 flex-col bg-card p-5">
          <div className="flex items-end justify-between">
            <p className="flex items-baseline gap-1"><span className="num text-5xl">{pad2(currentSlide?.slide_number ?? 0)}</span><span className="text-xs text-ink-soft">Slide</span><span className="ml-2 text-xs text-ink-soft">/ {pad2(slides.length)}</span></p>
            <button onClick={() => { setAuto(!auto); setManualUntil(0); }} className="flex items-center gap-2 text-xs font-semibold">
              <span className={autoActive ? "text-ink" : "text-ink-soft"}>Auto{manualLeft > 0 && auto ? ` · ${manualLeft}s` : ""}</span>
              <span className={cn("relative h-5 w-9 rounded-full transition-colors", auto ? "bg-ink" : "bg-tick")}>
                <span className={cn("absolute top-0.5 size-4 rounded-full bg-card transition-all", auto ? "left-[18px]" : "left-0.5")} />
              </span>
            </button>
          </div>
          <div className="relative mt-4 flex min-h-0 flex-1 items-center justify-center">
            {currentSlide?.image_url && urls[currentSlide.image_url] ? (
              <img key={currentSlide.id} src={urls[currentSlide.image_url]} alt={`Slide ${currentSlide.slide_number}`} className="animate-fade-up max-h-full max-w-full rounded-xl object-contain" />
            ) : (
              <p className="text-ink-soft">{slides.length ? "Loading slide…" : "No slides uploaded for this lecture."}</p>
            )}
            <button aria-label="Previous slide" onClick={() => manual(-1)} disabled={idx === 0} className="btn-circle absolute left-0 size-11"><ChevronLeft className="size-5" /></button>
            <button aria-label="Next slide" onClick={() => manual(1)} disabled={idx >= slides.length - 1} className="btn-circle absolute right-0 size-11"><ChevronRight className="size-5" /></button>
          </div>
        </section>

        {/* Notes */}
        <section className="card-flat flex min-h-0 flex-col bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Notes <span className="num ml-1 text-base text-ink">{pad2(notes.length)}</span></p>
          <div className="mt-3 flex rounded-full bg-muted p-1 text-sm font-semibold">
            {(["thought", "question"] as const).map((t) => (
              <button key={t} onClick={() => setNoteType(t)} className={cn("flex-1 rounded-full py-1.5 capitalize transition", noteType === t ? "bg-ink text-primary-foreground" : "text-ink-soft")}>{t}</button>
            ))}
          </div>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveNote()}
            placeholder={noteType === "question" ? "Ask a question…" : "Add a thought…"}
            className="mt-3 rounded-full bg-muted px-4 py-3 outline-none"
          />
          <div className="mt-6 flex-1 overflow-y-auto px-2 pb-6">
            {notesShown.map((n, i) => (
              <div key={n.id} className="relative" style={{ marginTop: i === 0 ? 0 : "-38%", zIndex: notesShown.length - i, marginLeft: `${(i % 3) * 6}px` }}>
                <StickyNote note={n} slideNumber={slideNum(n.slide_id)} fresh={freshIds.has(n.id)} />
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Control bar */}
      <footer className="card-flat flex items-center gap-5 bg-card px-5 py-3">
        <button aria-label={state === "recording" ? "Pause" : "Start / resume"} onClick={togglePause} disabled={state === "ending"} className="btn-circle size-14">
          {state === "recording" ? <Pause className="size-5 fill-current" /> : state === "idle" ? <Mic className="size-5" /> : <Play className="size-5 fill-current" />}
        </button>
        <button aria-label="End session" onClick={end} disabled={state === "ending" || state === "idle" && segs.length === 0} className="btn-circle size-14">
          <Square className="size-4 fill-current" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Barcode elapsed={elapsed} total={total} activity={activity} />
        </div>
        <p className="num whitespace-nowrap text-4xl">
          <span className="text-ink-soft">{fmtClock(elapsed).slice(0, 3)}</span>{fmtClock(elapsed).slice(3)}
        </p>
        <button aria-label="Text size" onClick={() => setTextSize((t) => (t + 1) % TEXT_SIZES.length)} className="btn-circle size-14 text-sm font-bold">Aa</button>
      </footer>
    </div>
  );
}
