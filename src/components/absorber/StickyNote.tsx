import { cn } from "@/lib/utils";
import { fmtShort, pad2, rotationFor } from "@/lib/absorber";
import type { CSSProperties } from "react";

export type Note = {
  id: string;
  text: string;
  timestamp: number;
  slide_id: string | null;
  color: string;
  type: string;
  transcript_snippet?: string | null;
};

export function StickyNote({
  note, slideNumber, fresh, className, style, onClick, size = "md",
}: {
  note: Note; slideNumber?: number; fresh?: boolean; className?: string; style?: CSSProperties;
  onClick?: () => void; size?: "sm" | "md";
}) {
  const rot = rotationFor(note.id);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "sticky-note relative flex aspect-square flex-col justify-between rounded-[6px] p-4 text-left transition-transform hover:z-10 hover:!rotate-0",
        size === "sm" ? "w-40" : "w-full",
        fresh && "animate-note-drop",
        className,
      )}
      style={{ background: note.color, transform: `rotate(${rot}deg)`, ["--rot" as string]: `${rot}deg`, ...style }}
    >
      <p className={cn("leading-tight", size === "sm" ? "text-xl" : "text-2xl", "line-clamp-5")}>
        {note.type === "question" && <span className="mr-1">?</span>}
        {note.text}
      </p>
      <span className="font-sans text-[10px] font-medium uppercase tracking-wider text-ink/50">
        {slideNumber ? `Slide ${pad2(slideNumber)} · ` : ""}{fmtShort(note.timestamp)}
      </span>
    </button>
  );
}
