// Founding 50: the first 50 people to publish a story. A progress bar ("Founding 50: X of 50
// voices") and a "Founding contributor #N" badge. Once 50 is reached the copy says so; badges stay.
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Award } from "lucide-react";
import { api, apiEnabled } from "@/lib/api";
import { cn } from "@/lib/utils";

export type Founding = { contributors: number; limit: number; complete: boolean; foundingRank: number | null };

export function useFounding() {
  return useQuery({ queryKey: ["founding"], queryFn: () => api<Founding>("/v1/stats/founding"), enabled: apiEnabled, staleTime: 60_000, retry: false }).data ?? null;
}

// Milestones after the first 50: the bar always shows the next one, so it never stops at "complete".
const MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
export function milestone(n: number) {
  const next = MILESTONES.find((m) => n < m) ?? Math.ceil((n + 1) / 10000) * 10000;
  const prev = [...MILESTONES].reverse().find((m) => m <= n) ?? 0;
  return { next, prev };
}

// 950 → "950", 2500 → "2.5k", 3000 → "3k", 1250000 → "1.3M"
export const short = (n: number) => (n < 1000 ? String(n) : n < 1_000_000 ? `${+(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k` : `${+(n / 1_000_000).toFixed(1)}M`);

export function FoundingProgress({ className, compact = false }: { className?: string; compact?: boolean }) {
  const f = useFounding();
  if (!f) return null;
  const n = f.contributors;
  const { next, prev } = milestone(n);
  const founding = next === f.limit;
  // From the last milestone to the next one, so the bar always has room to move.
  const pct = Math.min(100, ((n - prev) / (next - prev)) * 100);
  const title = founding ? `Founding 50: ${n} of 50 voices` : `${short(n)} voices · next milestone ${short(next)}`;
  const context = founding
    ? "The first 50 people to share a hiring experience get a founding contributor badge on their profile and stories, for good."
    : `Founding 50 complete, and the badges stay. Every experience shared makes Ghosted more useful for the next candidate. ${short(next - n)} to go to ${short(next)}.`;
  return <div className={cn("rounded-xl border-2 border-foreground bg-card p-3 shadow-hard-sm sm:p-4", className)}>
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <p className="flex items-center gap-1.5 text-sm font-bold"><Award className="size-4 text-primary" />{title}</p>
      {f.foundingRank ? <span className="text-xs font-bold text-primary">You're founding contributor #{f.foundingRank}</span> : founding && <span className="text-xs font-semibold text-muted-foreground">{50 - n} spots left</span>}
    </div>
    <div className="relative mt-2.5 h-2.5 rounded-full border-2 border-foreground bg-muted">
      <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
      <span aria-hidden="true" className="absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 border-foreground bg-card" style={{ left: `calc(${pct}% - 7px)` }} />
    </div>
    <div className="mt-1 flex justify-between text-[10px] font-semibold tabular-nums text-muted-foreground"><span>{short(prev)}</span><span>{short(next)}</span></div>
    {!compact && <p className="mt-1 text-xs text-muted-foreground">{context}</p>}
  </div>;
}

export function FoundingBadge({ rank, className }: { rank: number | null | undefined; className?: string }) {
  if (!rank) return null;
  return <span title={`One of the first 50 people to share a story on Ghosted`} className={cn("inline-flex items-center gap-1 rounded-full border-2 border-primary bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary", className)}><Award className="size-3" />Founding contributor #{rank}</span>;
}
