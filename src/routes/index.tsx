import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Absorber — Live lecture companion" },
      { name: "description", content: "Live transcription, automatic slide tracking, and sticky-note thoughts for lectures." },
      { property: "og:title", content: "Absorber — Live lecture companion" },
      { property: "og:description", content: "Live transcription, automatic slide tracking, and sticky-note thoughts for lectures." },
    ],
  }),
  beforeLoad: () => { throw redirect({ to: "/library" }); },
});
