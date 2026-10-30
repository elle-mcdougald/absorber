import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { embedTexts, transcribeAudio, structuredResponse, generateImage } from "./ai.server";

export const ILLUSTRATION_STYLE =
  "Minimal hand-drawn line illustration on off-white paper texture. Thick black marker lines, loose gestural strokes, occasional zigzag or sawtooth edges, soft airbrushed black shading, dashed grid accents. Black and white with ONE accent color: orange #F07A3A. No text, no realism. Simple, symbolic, bold. Visual metaphor for: ";

export const embed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ texts: z.array(z.string().max(20000)).max(400) }).parse(d))
  .handler(async ({ data }) => ({ embeddings: await embedTexts(data.texts) }));

export const transcribeChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Expected form data");
    const file = d.get("file");
    if (!(file instanceof Blob)) throw new Error("Missing audio");
    if (file.size > 10 * 1024 * 1024) throw new Error("Audio chunk too large");
    return { file, name: String(d.get("name") ?? "chunk.webm") };
  })
  .handler(async ({ data }) => {
    if (data.file.size < 1500) return { text: "" };
    return { text: await transcribeAudio(data.file, data.name) };
  });

type Ideas = { ideas: { title: string; summary: string; metaphor: string; slide_numbers: number[] }[] };

export const extractMainIdeas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lectureId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [{ data: slides }, { data: segs }] = await Promise.all([
      sb.from("slides").select("id, slide_number, text").eq("lecture_id", data.lectureId).order("slide_number"),
      sb.from("transcript_segments").select("text").eq("lecture_id", data.lectureId).order("start_time"),
    ]);
    const transcript = (segs ?? []).map((s) => s.text).join(" ").slice(0, 60000);
    const slideText = (slides ?? []).map((s) => `Slide ${s.slide_number}: ${s.text.slice(0, 600)}`).join("\n").slice(0, 30000);
    if (!transcript && !slideText) throw new Error("Nothing to summarize yet — the lecture has no transcript or slides.");

    const result = await structuredResponse<Ideas>({
      instructions:
        "You help students remember lectures. Extract the 3 to 6 main ideas of the lecture. For each: a short title (max 6 words), a 2-3 sentence plain-language summary, a simple concrete visual metaphor (one short phrase, no text in image), and the slide numbers it relates to.",
      input: `SLIDES:\n${slideText || "(none)"}\n\nTRANSCRIPT:\n${transcript || "(none)"}`,
      schemaName: "main_ideas",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ideas"],
        properties: {
          ideas: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "summary", "metaphor", "slide_numbers"],
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                metaphor: { type: "string" },
                slide_numbers: { type: "array", items: { type: "integer" } },
              },
            },
          },
        },
      },
    });

    const byNum = new Map((slides ?? []).map((s) => [s.slide_number, s.id]));
    await sb.from("main_ideas").delete().eq("lecture_id", data.lectureId);
    const rows = result.ideas.slice(0, 6).map((i, idx) => ({
      lecture_id: data.lectureId,
      title: i.title,
      summary: i.summary,
      position: idx,
      related_slide_ids: i.slide_numbers.map((n) => byNum.get(n)).filter((x): x is string => !!x),
    }));
    const { data: inserted, error } = await sb.from("main_ideas").insert(rows).select("id");
    if (error) throw new Error(error.message);
    return {
      ideas: (inserted ?? []).map((r, idx) => ({ id: r.id, metaphor: result.ideas[idx]?.metaphor || result.ideas[idx]?.title || "" })),
    };
  });

export const illustrateIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ideaId: z.string().uuid(), metaphor: z.string().max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: idea } = await sb.from("main_ideas").select("id, title").eq("id", data.ideaId).single();
    if (!idea) throw new Error("Idea not found");
    const bytes = await generateImage(ILLUSTRATION_STYLE + `${idea.title} — ${data.metaphor}`);
    const path = `${context.userId}/ideas/${idea.id}.png`;
    const { error: upErr } = await sb.storage.from("slides").upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(upErr.message);
    await sb.from("main_ideas").update({ image_url: path }).eq("id", idea.id);
    return { path };
  });
