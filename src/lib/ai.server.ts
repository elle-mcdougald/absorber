// Server-only helpers for calling Lovable AI Gateway.
const BASE = "https://ai.gateway.lovable.dev/v1";
export const EMBED_MODEL = "google/gemini-embedding-2";
export const CHAT_MODEL = "openai/gpt-6-astra";
export const IMAGE_MODEL = "openai/gpt-image-2.5-sunburst";
export const TRANSCRIBE_MODEL = "openai/gpt-transcribe";

function key() {
  const k = process.env["LOVABLE_API_KEY"];
  if (!k) throw new Error("AI is not configured");
  return k;
}

async function fail(res: Response): Promise<never> {
  let msg = `AI request failed (${res.status})`;
  try {
    const j = await res.json();
    msg = j?.error?.message ?? j?.message ?? msg;
  } catch { /* ignore */ }
  if (res.status === 402) msg = "Out of AI credits. Add credits in Settings → Plans & credits.";
  if (res.status === 429) msg = "AI is busy right now — please try again in a moment.";
  throw new Error(msg);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = new Array(texts.length);
  for (let i = 0; i < texts.length; i += 32) {
    const batch = texts.slice(i, i + 32).map((t) => t.trim() || "(empty)");
    const res = await fetch(`${BASE}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
    });
    if (!res.ok) await fail(res);
    const j = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    for (const d of j.data) out[i + d.index] = d.embedding;
  }
  return out;
}

export async function transcribeAudio(file: Blob, filename: string): Promise<string> {
  const fd = new FormData();
  fd.append("model", TRANSCRIBE_MODEL);
  fd.append("file", file, filename);
  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "X-Lovable-AIG-SDK": "fetch" },
    body: fd,
  });
  if (!res.ok) await fail(res);
  const j = (await res.json()) as { text?: string };
  return (j.text ?? "").trim();
}

/** Streams a Responses API call with a strict JSON schema and returns the parsed object. */
export async function structuredResponse<T>(opts: {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const res = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      instructions: opts.instructions,
      input: opts.input,
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema } },
    }),
  });
  if (!res.ok || !res.body) await fail(res);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    if (d) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") text += ev.delta;
        else if (ev.type === "response.failed" || ev.type === "error") throw new Error(ev.error?.message ?? "AI request failed");
        else if (ev.type === "response.completed") done = true;
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
  if (!text) throw new Error("AI returned no answer");
  return JSON.parse(text) as T;
}

export async function generateImage(prompt: string): Promise<Uint8Array> {
  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: "1024x1024", quality: "medium" }),
  });
  if (!res.ok) await fail(res);
  const j = (await res.json()) as { data: { b64_json?: string }[] };
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
