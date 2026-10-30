import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Upload, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { embed } from "@/lib/ai.functions";
import { processPdf } from "@/lib/pdf";
import { PALETTE, pad2 } from "@/lib/absorber";
import { TwoTone } from "@/components/absorber/graphics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/lectures/new")({
  head: () => ({
    meta: [
      { title: "New Lecture — Absorber" },
      { name: "description", content: "Set up a new lecture: choose a course, upload slides, and start listening." },
      { property: "og:title", content: "New Lecture — Absorber" },
      { property: "og:description", content: "Set up a new lecture and upload your slides." },
    ],
  }),
  component: NewLecture,
});

function NewLecture() {
  const nav = useNavigate();
  const embedFn = useServerFn(embed);
  const { data: courses = [], refetch } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => (await supabase.from("courses").select("*").order("created_at")).data ?? [],
  });
  const [courseId, setCourseId] = useState<string>("");
  const [newCourse, setNewCourse] = useState("");
  const [newColor, setNewColor] = useState<string>(PALETTE[0]!);
  const [title, setTitle] = useState("");
  const [lectureId, setLectureId] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [progress, setProgress] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);

  async function addCourse() {
    if (!newCourse.trim()) return undefined;
    const { data, error } = await supabase.from("courses").insert({ name: newCourse.trim(), color: newColor ?? "#4F8C84" }).select().single();
    if (error) { toast.error(error.message); return undefined; }
    setNewCourse("");
    await refetch();
    setCourseId(data.id);
  }

  async function ensureLecture() {
    if (lectureId) return lectureId;
    if (!courseId || !title.trim()) throw new Error("Pick a course and enter a title first.");
    const { data, error } = await supabase.from("lectures").insert({ course_id: courseId, title: title.trim() }).select().single();
    if (error) throw error;
    setLectureId(data.id);
    return data.id;
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      const id = await ensureLecture();
      const { data: u } = await supabase.auth.getUser();
      setProgress("Reading PDF…");
      const pages = await processPdf(file, (d, t) => setProgress(`Rendering page ${d} of ${t}…`));
      setThumbs(pages.map((p) => URL.createObjectURL(p.blob)));
      setProgress("Uploading slides…");
      await supabase.from("slides").delete().eq("lecture_id", id);
      const paths = await Promise.all(pages.map(async (p) => {
        const path = `${u.user!.id}/${id}/slide-${pad2(p.number)}-${Date.now()}.jpg`;
        const { error } = await supabase.storage.from("slides").upload(path, p.blob, { contentType: "image/jpeg" });
        if (error) throw error;
        return path;
      }));
      setProgress("Understanding each slide…");
      const { embeddings } = await embedFn({ data: { texts: pages.map((p) => p.text || `Slide ${p.number}`) } });
      const { error } = await supabase.from("slides").insert(pages.map((p, i) => ({
        lecture_id: id, slide_number: p.number, image_url: paths[i] ?? null, text: p.text, embedding: embeddings[i] ?? null,
      })));
      if (error) throw error;
      setProgress(`${pages.length} slides ready`);
    } catch (e) {
      toast.error((e as Error).message);
      setProgress("");
    } finally { setBusy(false); }
  }

  async function start() {
    try {
      const id = await ensureLecture();
      await supabase.from("lectures").update({ status: "live", date: new Date().toISOString() }).eq("id", id);
      nav({ to: "/lectures/$id/live", params: { id } });
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 md:px-10">
      <Link to="/library" className="btn-circle size-11"><ArrowLeft className="size-4" /></Link>
      <TwoTone top="New Lecture" bottom="Get ready to listen" className="mt-8 text-5xl md:text-6xl" />

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <section className="card-flat bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Course</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {courses.map((c) => (
              <button key={c.id} disabled={!!lectureId} onClick={() => setCourseId(c.id)} className={cn("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition", courseId === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-ink")}>
                <span className="size-3 rounded-full" style={{ background: c.color }} />{c.name}
              </button>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <input value={newCourse} onChange={(e) => setNewCourse(e.target.value)} placeholder="New course name" className="min-w-0 flex-1 rounded-full bg-muted px-4 py-2 outline-none" />
            <button onClick={addCourse} className="rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">Add</button>
          </div>
          <div className="mt-3 flex gap-2">
            {PALETTE.map((c) => (
              <button key={c} aria-label={`Color ${c}`} onClick={() => setNewColor(c)} className={cn("size-7 rounded-full shadow-button", newColor === c && "ring-2 ring-ink ring-offset-2")} style={{ background: c }} />
            ))}
          </div>
        </section>

        <section className="card-flat bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Lecture title</p>
          <input disabled={!!lectureId} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cognitive Load Theory" className="headline mt-4 w-full bg-transparent text-3xl outline-none placeholder:text-ink-soft/50" />
          <label className={cn("mt-8 flex cursor-pointer items-center justify-center gap-3 rounded-full bg-muted py-4 font-semibold", busy && "pointer-events-none opacity-60")}>
            <Upload className="size-5" /> {thumbs.length ? "Replace slides (PDF)" : "Upload slides (PDF)"}
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          {progress && <p className="mt-3 text-center text-sm text-ink-soft">{progress}</p>}
        </section>
      </div>

      {thumbs.length > 0 && (
        <section className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {thumbs.map((t, i) => (
            <div key={t} className="animate-fade-up overflow-hidden rounded-2xl bg-card">
              <img src={t} alt={`Slide ${i + 1}`} className="aspect-video w-full object-contain" />
              <p className="px-3 py-1 text-xs text-ink-soft"><span className="num text-base text-ink">{pad2(i + 1)}</span> Slide</p>
            </div>
          ))}
        </section>
      )}

      <section className="card-flat mt-5 flex flex-col items-center justify-between gap-4 bg-card p-6 md:flex-row">
        <label className="flex cursor-pointer items-center gap-3">
          <button type="button" role="checkbox" aria-checked={consent} onClick={() => setConsent(!consent)} className={cn("grid size-6 place-items-center rounded-md border-2 border-ink", consent && "bg-ink text-primary-foreground")}>
            {consent && <Check className="size-4" />}
          </button>
          <span className="font-medium">Make sure you have permission to record this lecture.</span>
        </label>
        <button disabled={!consent || busy || !courseId || !title.trim()} onClick={start} className="rounded-full bg-primary px-8 py-4 font-semibold text-primary-foreground disabled:opacity-30">
          Start Session
        </button>
      </section>
    </div>
  );
}
