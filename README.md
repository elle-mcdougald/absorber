# Absorber

Build a web app called Absorber: a live lecture companion for students. It listens to a lecture, transcribes it in real time, automatically shows the slide being discussed, and lets the student add sticky-note thoughts that are anchored to that exact moment and slide. After the lecture, it generates simple illustrations for the main ideas to help visual learners remember them.

<img width="1419" height="797" alt="Screenshot 2026-11-03 at 17 40 36" src="https://github.com/user-attachments/assets/d33aa6d0-9949-4e0a-9cce-bb998163f6fa" />
<img width="1414" height="801" alt="Screenshot 2026-11-03 at 17 40 26" src="https://github.com/user-attachments/assets/b0493ee3-f794-45f3-a905-3171dd42e70d" />

## TECH STACK
- React + Tailwind, Supabase for auth, database, storage, and edge functions.
- OpenAI for everything AI. Store the OpenAI API key in Supabase secrets, never in the frontend.
  - Live transcription: OpenAI Realtime API (transcription mode) via WebSocket. Create a Supabase edge function that issues short-lived ephemeral tokens so the browser can connect securely.
  - Slide matching: OpenAI embeddings (text-embedding-3-small).
  - Main-idea extraction: OpenAI chat model.
  - Illustrations: OpenAI image generation.
- PDF processing in the browser with pdf.js: render each page to an image and extract its text.
- Laptop-first, responsive down to iPad.

## DATA MODEL (Supabase)
- users (Supabase auth)
- courses: id, user_id, name, color
- lectures: id, course_id, title, date, status (draft | live | processing | complete), duration
- slides: id, lecture_id, slide_number, image_url, text, embedding
- transcript_segments: id, lecture_id, text, start_time, end_time, matched_slide_id, embedding
- notes: id, lecture_id, slide_id, text, timestamp, transcript_snippet, color, type (thought | question)
- main_ideas: id, lecture_id, title, summary, related_slide_ids, image_url
Enable row-level security so users only see their own data.

## PAGES

### 1. Library (home)
- Large two-tone headline: "Your Lectures" (black) / "This Semester" (grey).
- Horizontal tabs to filter by course.
- Lectures shown as rounded color cards in the course's color, with a black geometric dot-pattern graphic, lecture title in bold top-left, date and duration small and grey bottom-left.
- "+ New Lecture" button.

### 2. New Lecture
- Choose or create a course, enter a lecture title.
- Upload slides (PDF). Process with pdf.js: save each page as an image to Supabase storage, extract text, generate an embedding per slide.
- Show a grid of slide thumbnails when done.
- Before starting, show a reminder: "Make sure you have permission to record this lecture." with a checkbox to confirm.
- "Start Session" button.

### 3. Live Session Dashboard (the core screen)
Three rounded-card panels on a grey background, plus a pinned control bar:
- CENTER (largest): the current slide image. Small label above: "05 Slide" (big light number, tiny grey label). Prev/next arrows to manually override. A small "Auto" toggle; when the user manually changes slides, auto-matching pauses for 60 seconds, then resumes.
- LEFT: live transcript, streaming word by word, auto-scrolling. Each paragraph is marked with a timestamp. The paragraphs tied to the current slide are black; older ones fade to grey.
- RIGHT: notes panel. A text input at the top ("Add a thought…"), press Enter to save. A toggle to mark a note as a Thought or Question. Saved notes appear below as sticky notes (style below).
- BOTTOM CONTROL BAR: a white rounded panel pinned to the bottom with circular white buttons: pause/resume, end session, text size "Aa". In the middle, a barcode-style audio timeline: vertical tick marks for elapsed time (solid black) and remaining time (thin grey ticks), with tick density reflecting speech activity. Show the elapsed time large, e.g. "00:42:18".

Slide matching logic:
- Every 20 seconds, take the last ~60 seconds of transcript, create an embedding, and compare it (cosine similarity) to all slide embeddings.
- Only switch slides if the best match beats the current slide by a meaningful margin, to avoid flickering. Favor the current and next slide slightly, since lectures usually move forward.
- Save each transcript segment with its matched slide.

Note logic:
- Each note saves with: its text, the current timestamp, the current slide id, and the last ~2 sentences of transcript.

### 4. Review Page (after the session)
- When the session ends, set status to "processing" and show a loading state.
- Use OpenAI to extract the 3–6 main ideas of the lecture from the full transcript + slide text. For each, write a title and a 2–3 sentence summary, and link the related slides.
- Generate one illustration per main idea (style below).
- Layout: a vertical scroll of slides. Each slide shows: the slide image, its matched transcript section (collapsible), and the sticky notes attached to it beside it.
- Main ideas are shown as a horizontal row of large cards at the top, each with its illustration, title, and summary. Clicking one jumps to its related slides.
- Clicking a note or transcript timestamp highlights that spot.
- Search bar to search within transcript and notes.

## UI STYLE (match the attached reference screenshots)
Swiss / editorial minimalism.
- Background: warm light grey #D6D4D0. The live session uses a slightly cooler grey #B8BBBE.
- Typography: "Inter" (or "Inter Tight"), bold 700 for headlines with tight line-height. Headlines are two-tone: first line black, second line mid-grey #8E8E8E. Numbers (timers, slide numbers, counts) are very large, light weight, with a tiny grey label beside them.
- Cards: 24px rounded corners, flat fills, no borders, no gradients. Card palette: teal #4F8C84, dusty rose #B89A9A, tan #B39A82, orange #F07A3A, green #4E8F57, lilac #D9B8F0, white #FFFFFF.
- Decorative graphics: black geometric dot patterns, concentric rings, and dial shapes.
- Buttons: circular, white, black icons, subtle shadow.
- Tabs: active in black, inactive in light grey, no underlines.
- Generous whitespace. Black icons only. Smooth, minimal animations.

## STICKY NOTE STYLE
- Square notes in the muted card palette (default tan #B39A82; Questions in orange #F07A3A).
- Each slightly rotated randomly between -3° and 3°, with a soft drop shadow underneath so they look stuck on the page.
- In the notes panel, they stack in a gently overlapping, fanned layout, like a hand of cards.
- Text in "Caveat" (handwritten) font, dark. Small grey timestamp and slide number at the bottom ("Slide 05 · 12:41").
- New notes animate in, dropping into place.

## ILLUSTRATION STYLE (for main-idea images)
Every image uses this exact style prompt, plus a simple visual metaphor for the idea:
"Minimal hand-drawn line illustration on off-white paper texture. Thick black marker lines, loose gestural strokes, occasional zigzag or sawtooth edges, soft airbrushed black shading, dashed grid accents. Black and white with ONE accent color: [orange #F07A3A]. No text, no realism. Simple, symbolic, bold. Visual metaphor for: [main idea]."

## BUILD ORDER
1. Auth, data model, Library, and New Lecture with PDF upload and processing.
2. Live Session dashboard with live transcription and notes.
3. Slide matching.
4. Review page, main ideas, and illustrations.
5. Polish the styling to match the references.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://absorber.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3bf232b6-d907-4af4-917e-71152378590f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
