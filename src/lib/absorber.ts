import { supabase } from "@/integrations/supabase/client";

export const PALETTE = ["#4F8C84", "#B89A9A", "#B39A82", "#F07A3A", "#4E8F57", "#D9B8F0", "#FFFFFF"];
export const NOTE_COLORS = { thought: "#B39A82", question: "#F07A3A" } as const;

export function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return [h, m, r].map((x) => String(x).padStart(2, "0")).join(":");
}
export function fmtShort(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Stable pseudo-random rotation between -3 and 3 deg from an id. */
export function rotationFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 600) / 100) - 3;
}

/** Turn storage paths into signed URLs (bucket is private). */
export async function signPaths(paths: (string | null | undefined)[]) {
  const list = Array.from(new Set(paths.filter((p): p is string => !!p)));
  const map: Record<string, string> = {};
  if (!list.length) return map;
  const { data } = await supabase.storage.from("slides").createSignedUrls(list, 60 * 60 * 6);
  for (const d of data ?? []) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  return map;
}

/**
 * Choose the slide that best matches a recent transcript embedding.
 * Favors the current and next slide slightly; only switches when the
 * winner beats the current slide by a meaningful margin.
 */
export function pickSlide(
  query: number[],
  slides: { id: string; embedding: number[] | null }[],
  currentIndex: number,
  margin = 0.03,
): number {
  if (!slides.length) return currentIndex;
  const scores = slides.map((s, i) => {
    if (!s.embedding) return -1;
    let score = cosine(query, s.embedding);
    if (i === currentIndex) score += 0.015;
    if (i === currentIndex + 1) score += 0.01;
    return score;
  });
  let best = currentIndex;
  for (let i = 0; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  if (best === currentIndex) return currentIndex;
  return scores[best] - (scores[currentIndex] ?? -1) >= margin ? best : currentIndex;
}
