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

export function FoundingProgress({ className, compact = false }: { className?: string; compact?: boolean }) {
  const f = useFounding();
  if (!f) return null;
  const n = Math.min(f.contributors, f.limit);
  const pct = (n / f.limit) * 100;
  return <div className={cn("rounded-xl border-2 border-foreground bg-card p-3 shadow-hard-sm", className)}>
    <div className="flex items-baseline justify-between gap-2">
      <p className="flex items-center gap-1.5 text-sm font-bold"><Award className="size-4 text-primary" />{f.complete ? "Founding 50 complete" : `Founding 50: ${n} of ${f.limit} voices`}</p>
      {f.foundingRank && <span className="text-xs font-bold text-primary">You're #{f.foundingRank}</span>}
    </div>
    <div className="relative mt-2 h-2.5 rounded-full border-2 border-foreground bg-muted">
      <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
      <span aria-hidden="true" className="absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 border-foreground bg-card" style={{ left: `calc(${pct}% - 7px)` }} />
    </div>
    {!compact && <p className="mt-1.5 text-xs text-muted-foreground">{f.complete ? "The first 50 people to share a story keep their founding badge for good." : "The first 50 people to share a story get a founding contributor badge, for good."}</p>}
  </div>;
}

export function FoundingBadge({ rank, className }: { rank: number | null | undefined; className?: string }) {
  if (!rank) return null;
  return <span title={`One of the first 50 people to share a story on Ghosted`} className={cn("inline-flex items-center gap-1 rounded-full border-2 border-primary bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary", className)}><Award className="size-3" />Founding contributor #{rank}</span>;
}
