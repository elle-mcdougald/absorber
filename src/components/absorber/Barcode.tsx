import { cn } from "@/lib/utils";

/** Barcode-style audio timeline: solid ticks for elapsed time (height/density = speech activity), thin grey ticks for remaining. */
export function Barcode({ elapsed, total, activity, className }: { elapsed: number; total: number; activity: number[]; className?: string }) {
  const TICKS = 140;
  const per = total / TICKS;
  const done = Math.min(TICKS, Math.floor(elapsed / per));
  return (
    <div className={cn("flex h-10 items-center gap-[3px] overflow-hidden", className)} aria-hidden>
      {Array.from({ length: TICKS }).map((_, i) => {
        if (i < done) {
          const from = Math.floor(i * per), to = Math.max(from + 1, Math.floor((i + 1) * per));
          let a = 0;
          for (let s = from; s < to; s++) a = Math.max(a, activity[s] ?? 0);
          if (a < 0.08) return <span key={i} className="h-1 w-[2px] shrink-0 bg-ink/30" />;
          return <span key={i} className="w-[2px] shrink-0 bg-ink" style={{ height: `${30 + a * 70}%`, width: a > 0.5 ? 3 : 2 }} />;
        }
        return <span key={i} className="h-[55%] w-px shrink-0 bg-tick" />;
      })}
    </div>
  );
}
