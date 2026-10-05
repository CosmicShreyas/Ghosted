import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BadgeCheck, Lock, Printer } from "lucide-react";
import { Preloader } from "@/components/preloader";
import { Button } from "@/components/ui/button";
import { ApiRequestError, apiEnabled } from "@/lib/api";
import { fetchPulse, type Bucket, type Pulse } from "@/lib/company-voice";
import { SITE_URL } from "@/lib/meta";
import { useAuthGuard } from "@/lib/session";
import { OUTCOME_LABEL } from "@/lib/stories";
import { cn } from "@/lib/utils";

// Company Pulse: private aggregates for a company's verified representatives (backend demand.ts).
// Never a single story or author: every metric needs at least 5 stories, and any group under 3 is
// hidden. "Share with my hiring manager" prints it as one page (the browser's Save as PDF works).
export const Route = createFileRoute("/pulse/$slug")({
  head: () => ({ meta: [{ title: "Company Pulse | Ghosted" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PulsePage,
});

const STAGE: Record<string, string> = { application: "After applying", screening: "After screening", technical: "After the technical round", final: "After the final round", offer: "At the offer stage" };
const month = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-xl border-2 border-foreground bg-card p-4 print:border print:shadow-none">
    <p className="text-xs font-bold text-muted-foreground">{label}</p>
    <p className="mt-1 font-display text-3xl font-bold tabular-nums">{value}</p>
    {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
  </div>;
}

function BucketList({ title, items, hidden, label }: { title: string; items: Bucket[]; hidden: number; label: (k: string) => string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return <section className="rounded-xl border-2 border-foreground bg-card p-4 print:break-inside-avoid print:border print:shadow-none">
    <h2 className="font-display text-lg font-bold">{title}</h2>
    {items.length ? <ul className="mt-3 space-y-2.5">{items.map((b) => <li key={b.key}>
      <div className="flex justify-between text-sm"><span>{label(b.key)}</span><span className="font-bold tabular-nums">{b.count}</span></div>
      <div className="mt-1 h-2 rounded-full bg-muted print:border"><div className="h-full rounded-full bg-primary" style={{ width: `${(b.count / max) * 100}%` }} /></div>
    </li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Not enough stories yet to show this without singling anyone out.</p>}
    {hidden > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{hidden} {hidden === 1 ? "story is" : "stories are"} in groups too small to show.</p>}
  </section>;
}

function Trend({ points }: { points: { month: string; value: number | null }[] }) {
  return <section className="rounded-xl border-2 border-foreground bg-card p-4 print:break-inside-avoid print:border print:shadow-none">
    <h2 className="font-display text-lg font-bold">Flag Score, month by month</h2>
    <p className="text-[11px] text-muted-foreground">Average of stories posted that month. Months with fewer than 3 stories are left blank.</p>
    <div className="mt-4 flex h-36 items-end gap-2">{points.map((p) => <div key={p.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
      <span className="text-xs font-bold tabular-nums">{p.value ?? "–"}</span>
      <div className={cn("w-full max-w-12 rounded-t-md border-2 border-b-0", p.value == null ? "border-dashed border-foreground/30" : "border-foreground", p.value == null ? "" : p.value >= 70 ? "bg-flag-green" : p.value >= 40 ? "bg-flag-amber" : "bg-flag-red")} style={{ height: `${p.value == null ? 6 : Math.max(p.value, 4)}%` }} />
      <span className="w-full border-t-2 border-foreground pt-1 text-center text-[11px] text-muted-foreground">{month(p.month)}</span>
    </div>)}</div>
  </section>;
}

function PulsePage() {
  const { slug } = Route.useParams();
  const { waiting } = useAuthGuard("private");
  const q = useQuery({ queryKey: ["pulse", slug], queryFn: () => fetchPulse(slug), enabled: apiEnabled && !waiting, retry: false });
  if (waiting || (apiEnabled && q.isPending)) return <Preloader />;
  const forbidden = q.error instanceof ApiRequestError && q.error.status === 403;
  const d = q.data as Pulse | undefined;
  const generated = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return <div className="min-h-screen bg-background">
    <header className="border-b-2 border-foreground bg-card print:hidden">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/c/$slug" params={{ slug }} className="inline-flex items-center gap-1.5 text-sm font-bold hover:underline"><ArrowLeft className="size-4" />Back to the company page</Link>
        {d && !d.locked && <Button variant="outline" onClick={() => window.print()}><Printer />Share with my hiring manager</Button>}
      </div>
    </header>
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 print:max-w-none print:space-y-3 print:p-0">
      {!d ? <div className="mx-auto max-w-lg rounded-xl border-2 border-dashed border-foreground/40 p-10 text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-display text-xl font-bold">{forbidden ? "Company Pulse is for verified representatives" : "Couldn't load Company Pulse"}</p>
          <p className="mt-2 text-sm text-muted-foreground">{forbidden ? "Verify with your work email from the company page to see it." : "Check your connection and try again."}</p>
        </div>
        : <>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-sky-700 dark:text-sky-400 print:text-black"><BadgeCheck className="size-4" />Company Pulse · private to verified representatives</p>
            <h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl">{d.company.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Aggregated from {d.stories} candidate {d.stories === 1 ? "story" : "stories"} on Ghosted · {generated}. Never individual stories or who wrote them.</p>
          </div>
          {d.locked ? <div className="rounded-xl border-2 border-dashed border-foreground/40 p-8 text-center">
              <p className="font-display text-xl font-bold">Not enough stories yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Company Pulse opens at {d.need} stories ({d.stories} so far), so no number can point at a single candidate.</p>
            </div>
            : <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Median days to first reply" value={d.medianDaysToReply != null ? `${d.medianDaysToReply}d` : "–"} note={d.repliedSample ? `From ${d.repliedSample} stories that heard back` : "Needs at least 5 stories that heard back"} />
                <Metric label="Flag Score (all stories)" value={d.flagNow != null ? String(d.flagNow) : "–"} note="Out of 100, from candidates' ratings" />
                <Metric label="Candidates asking you to respond" value={d.requests != null ? String(d.requests) : "Fewer than 3"} />
              </div>
              <div className="grid gap-3 md:grid-cols-2 print:grid-cols-2">
                <BucketList title="How candidates' processes ended" items={d.outcomes} hidden={d.outcomesHidden} label={(k) => OUTCOME_LABEL[k] ?? k} />
                <BucketList title="Where candidates go quiet" items={d.quietStages} hidden={d.quietHidden} label={(k) => STAGE[k] ?? k} />
              </div>
              <Trend points={d.flagTrend} />
            </>}
          <p className="border-t-2 border-dashed border-foreground/20 pt-3 text-xs text-muted-foreground">Based on candidate stories on Ghosted, not verified by the company. Metrics need at least 5 stories; groups under 3 are hidden. {SITE_URL.replace(/^https?:\/\//, "")}/c/{slug}</p>
        </>}
    </main>
  </div>;
}
