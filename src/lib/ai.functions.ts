import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { embedTexts, transcribeAudio, structuredResponse } from "./ai.server";

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

type Ideas = { ideas: { title: string; bullets: string[]; slide_numbers: number[] }[] };

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
        "You help students remember lectures. Extract the 3 to 6 main ideas of the lecture. For each: a short title (max 6 words), 3 to 5 core bullet points (each one short plain-language sentence a student should remember), and the slide numbers it relates to.",
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
              required: ["title", "bullets", "slide_numbers"],
              properties: {
                title: { type: "string" },
                bullets: { type: "array", items: { type: "string" } },
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
      summary: i.bullets.join(" "),
      bullets: i.bullets,
      position: idx,
      related_slide_ids: i.slide_numbers.map((n) => byNum.get(n)).filter((x): x is string => !!x),
    }));
    const { error } = await sb.from("main_ideas").insert(rows);
    if (error) throw new Error(error.message);
    return { count: rows.length };
  });
