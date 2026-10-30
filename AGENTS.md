<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- All AI (transcription, embeddings, main ideas, images) goes through Lovable AI Gateway via server-only helpers in src/lib/ai.server.ts, exposed as authenticated server functions in src/lib/ai.functions.ts — keeps the key server-side.
- Live transcription records the mic in 5-second standalone MediaRecorder chunks — each chunk is independently decodable for the transcription endpoint.
- Slide/transcript embeddings are stored as jsonb and compared client-side (pickSlide in src/lib/absorber.ts) — a lecture has few slides, so no vector index is needed.
- The "slides" storage bucket is private; store object paths in DB and use signed URLs (signPaths) — workspace blocks public buckets.
