// "Typical process" for a company: how far people usually got, how long they waited, how it ended
// and what was offered. Only real stories, only from 5 of them (the API decides), and every figure
// that doesn't have enough behind it says so instead of guessing. Ghosted doesn't record a count of
// rounds or the posted salary, so neither is ever shown as a number.
import { Clock, Footprints, IndianRupee, PenLine, PieChart, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { card } from "@/components/dashboard/ui-kit";
import type { ProcessSummary } from "@/lib/companies";
import { useTone, voice } from "@/lib/session";
import { cn } from "@/lib/utils";

export const STAGE_NAME: Record<string, string> = { application: "Application", screening: "Screening call", technical: "Technical round", final: "Final round", offer: "Offer stage" };
const OUTCOME_NAME: Record<string, string> = { ghosted: "Ghosted", rejected: "Rejected", offer: "Offer", offer_revoked: "Offer revoked", ghost_job: "Ghost job" };
const OUTCOME_BAR: Record<string, string> = { ghosted: "bg-flag-red", rejected: "bg-flag-amber", offer: "bg-flag-green", offer_revoked: "bg-foreground", ghost_job: "bg-primary" };
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

function Stat({ icon: Icon, label, value, note }: { icon: typeof Clock; label: string; value: string; note: string }) {
  return <div className="min-w-0 rounded-lg border-2 border-foreground/15 p-3">
    <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><Icon className="size-3.5" />{label}</p>
    <p className="mt-1 font-display text-xl font-bold leading-tight">{value}</p>
    <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
  </div>;
}

// The outcome mix as one stacked bar, with a legend that wraps on phones.
export function OutcomeMix({ outcomes }: { outcomes: { outcome: string; share: number }[] }) {
  const shown = outcomes.filter((o) => o.share > 0);
  return <div>
    <div className="flex h-3 overflow-hidden rounded-full border-2 border-foreground" role="img" aria-label={shown.map((o) => `${OUTCOME_NAME[o.outcome]} ${o.share}%`).join(", ")}>
      {shown.map((o) => <span key={o.outcome} className={OUTCOME_BAR[o.outcome]} style={{ width: `${o.share}%` }} />)}
    </div>
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">{shown.map((o) => <li key={o.outcome} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full", OUTCOME_BAR[o.outcome])} />{OUTCOME_NAME[o.outcome]} <b className="tabular-nums">{o.share}%</b></li>)}</ul>
  </div>;
}

export function TypicalProcess({ process, name, onShare, compact = false }: { process: ProcessSummary | undefined; name: string; onShare?: () => void; compact?: boolean }) {
  const tone = useTone();
  if (!process) return null;
  if (!process.ready) return <section className={cn(card, "p-4 sm:p-5")} aria-label={`Typical process at ${name}`}>
    <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Route className="size-5 text-primary" />Typical process</h2>
    <p className="mt-1 text-sm text-muted-foreground">{voice(tone, `Needs ${process.needed} more ${process.needed === 1 ? "story" : "stories"} before we'll call anything "typical". We don't do vibes, we do receipts.`, `Needs ${process.needed} more ${process.needed === 1 ? "story" : "stories"} before we can show a typical process.`)}</p>
    {/* Progress toward the 5-story minimum: a round marker on a track. */}
    <div className="relative mt-3 h-2 rounded-full bg-muted" aria-hidden="true">
      <div className="h-full rounded-full bg-primary" style={{ width: `${(process.stories / 5) * 100}%` }} />
      <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-card" style={{ left: `${(process.stories / 5) * 100}%` }} />
    </div>
    <p className="mt-1.5 text-xs text-muted-foreground"><b className="text-foreground">{process.stories}</b> of 5 stories</p>
    {onShare && <Button size="sm" className="mt-3" onClick={onShare}><PenLine />Share how it went at {name}</Button>}
  </section>;

  return <section className={cn(card, "p-4 sm:p-5")} aria-label={`Typical process at ${name}`}>
    <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Route className="size-5 text-primary" />Typical process</h2>
    <p className="text-xs text-muted-foreground">From {process.stories} stories. Medians, so one extreme story can't skew it.</p>
    <div className={cn("mt-3 grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3")}>
      <Stat icon={Footprints} label="Usually gets as far as" value={process.usualStage ? STAGE_NAME[process.usualStage] ?? process.usualStage : "Not enough data"} note="The middle story's furthest round" />
      <Stat icon={Clock} label="Typical wait for a reply" value={process.medianDays != null ? days(process.medianDays) : "Not enough data"} note={process.medianDays != null ? `Median of ${process.waitReports} stories with a wait` : `Needs 3 stories with a wait (${process.waitReports} so far)`} />
      <Stat icon={IndianRupee} label="Reported offer pay" value={process.offerPay ? `₹${process.offerPay.median} LPA` : "Not enough data"} note={process.offerPay ? `Median of ${process.offerPay.reports} offers` : "Needs 3 stories with an offer range"} />
    </div>
    <div className="mt-4">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><PieChart className="size-3.5" />How it ends</p>
      <OutcomeMix outcomes={process.outcomes} />
    </div>
    <p className="mt-3 text-[11px] text-muted-foreground">Offer vs posted pay: not shown, because Ghosted doesn't record the posted range yet. We'd rather show nothing than guess.</p>
  </section>;
}
