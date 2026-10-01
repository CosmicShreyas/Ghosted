// Shared chart styling for every dashboard chart (recharts), so they look and behave the same:
// recessive grid and axes, one violet series colour, and a Ghosted-style hover card.
import type { ReactNode } from "react";

export const INK = "var(--foreground)";
export const MUTED_INK = "var(--muted-foreground)";
// Validated pair (see dataviz notes); CSS variables so charts re-colour in dark mode (styles.css).
export const SERIES = { primary: "var(--chart-violet)", secondary: "var(--chart-cyan)" };

// Recessive axes and gridlines: a faint tint of the text colour (the border token is near-black,
// which made dashed gridlines compete with the data).
const FAINT = "color-mix(in oklch, var(--foreground), transparent 86%)";
export const axis = { tick: { fontSize: 11, fill: MUTED_INK }, tickLine: false, axisLine: { stroke: "color-mix(in oklch, var(--foreground), transparent 70%)" } } as const;
export const grid = { strokeDasharray: "3 4", vertical: false, stroke: FAINT } as const;

// Dashed vertical guide on line/area charts, soft band on bar charts.
export const lineCursor = { stroke: INK, strokeWidth: 1.5, strokeDasharray: "4 4" };
export const barCursor = { fill: "var(--muted)", opacity: 0.7, radius: 6 };

// Hovered point: a white-ringed dot so it stands out on the line.
export const activeDot = { r: 6, stroke: "var(--card)", strokeWidth: 2.5 };

type Payload = { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> };

// Tooltip content in the site's style: bordered card, hard shadow, bold value, muted label.
// Text stays in ink colours; the small swatch carries the series colour.
export function ChartTooltip({ active, payload, label, unit = "", labelFormat }: { active?: boolean; payload?: Payload[]; label?: ReactNode; unit?: string; labelFormat?: (l: ReactNode) => ReactNode }) {
  if (!active || !payload?.length) return null;
  return <div className="min-w-32 rounded-lg border-2 border-foreground bg-card px-3 py-2 text-foreground shadow-hard-sm">
    <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{labelFormat ? labelFormat(label) : label}</p>
    <div className="mt-1 space-y-0.5">{payload.map((p) => <p key={String(p.dataKey ?? p.name)} className="flex items-center gap-2 text-sm">
      <span className="size-2.5 shrink-0 rounded-sm border border-foreground" style={{ background: p.color }} />
      {payload.length > 1 && <span className="text-muted-foreground">{p.name}</span>}
      <strong className="ml-auto font-display text-base tabular-nums">{p.value}{unit}</strong>
    </p>)}</div>
  </div>;
}
