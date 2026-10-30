import { cn } from "@/lib/utils";

/** Black geometric dot patterns used as card decoration. */
export function DotPattern({ variant = 0, className }: { variant?: number; className?: string }) {
  const v = Math.abs(variant) % 4;
  const dots: { x: number; y: number; r: number }[] = [];
  if (v === 0) {
    // radial burst
    dots.push({ x: 50, y: 50, r: 4 });
    [14, 26, 38].forEach((rad, ring) => {
      const n = 6 + ring * 4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.3;
        dots.push({ x: 50 + Math.cos(a) * rad, y: 50 + Math.sin(a) * rad, r: 4 });
      }
    });
  } else if (v === 1) {
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) dots.push({ x: 20 + c * 12, y: 20 + r * 12, r: 3 });
  } else if (v === 2) {
    // diamond
    for (let r = -4; r <= 4; r++) {
      const w = 4 - Math.abs(r);
      for (let c = -w; c <= w; c++) dots.push({ x: 50 + c * 10, y: 50 + r * 10, r: 4.2 });
    }
  } else {
    // circle filled grid
    for (let r = -4; r <= 4; r++) for (let c = -4; c <= 4; c++) if (r * r + c * c <= 17) dots.push({ x: 50 + c * 9, y: 50 + r * 9, r: 3.6 });
  }
  return (
    <svg viewBox="0 0 100 100" className={cn("fill-ink", className)} aria-hidden>
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} />)}
    </svg>
  );
}

export function Rings({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("stroke-ink fill-none", className)} aria-hidden>
      {[46, 36, 26, 16].map((r) => <circle key={r} cx="50" cy="50" r={r} strokeWidth="1.2" />)}
      <path d="M50 4 A46 46 0 0 1 96 50" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function Dial({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={cn("stroke-ink fill-none", className)} aria-hidden>
      <circle cx="50" cy="50" r="44" strokeWidth="1" strokeDasharray="1 2.4" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <line key={i} x1={50 + Math.cos(a) * 30} y1={50 + Math.sin(a) * 30} x2={50 + Math.cos(a) * 36} y2={50 + Math.sin(a) * 36} strokeWidth="2" />;
      })}
      <path d="M50 50 L50 38 M50 50 L40 57 M50 50 L60 57" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function TwoTone({ top, bottom, className, bottomClassName }: { top: string; bottom: string; className?: string; bottomClassName?: string }) {
  return (
    <h1 className={cn("headline", className)}>
      <span className="block text-ink">{top}</span>
      <span className={cn("block text-ink-soft", bottomClassName)}>{bottom}</span>
    </h1>
  );
}
