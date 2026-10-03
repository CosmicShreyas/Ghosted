// Growth: the weekly Ghosting Report (one real finding to post on LinkedIn and X, each linking back
// to a company page) and ready-made replies for "anyone interviewed at X?" threads. Everything is
// written from real published stories; nothing is posted automatically.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Linkedin, Megaphone, MessageCircleReply, Search, TrendingUp, Twitter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { adminApi } from "../api";
import { card, Empty, PageHead, Panel, Segmented, Skeleton } from "../ui";

type Finding = { id: string; headline: string; detail: string; link: string; linkedin: string; x: string };
type Report = { ready: boolean; stories: number; needed: number; findings: Finding[] };
type Reply = { name: string; slug: string; stories: number; url: string; reply: string };

function CopyButton({ text, label, icon: Icon = Copy }: { text: string; label: string; icon?: typeof Copy }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); toast.success("Copied."); setTimeout(() => setDone(false), 1500); } catch { toast.error("Couldn't copy."); } };
  return <Button size="sm" variant="outline" className="min-h-10" onClick={() => void copy()}>{done ? <Check /> : <Icon />}{label}</Button>;
}

// ---------- the funnel: where people come in, and where they drop off ----------
type FunnelData = { installed: boolean; days: number; now: Record<string, number>; before: Record<string, number> };
const STEPS: { id: string; label: string; ids: string[] }[] = [
  { id: "visit", label: "Landing visits", ids: ["visit"] },
  { id: "tools", label: "Free tool uses", ids: ["ghostometer", "timeline_check", "followup"] },
  { id: "search", label: "Company searches", ids: ["company_search"] },
  { id: "signup", label: "Sign-ups", ids: ["signup"] },
  { id: "story", label: "First stories", ids: ["first_story"] },
];
function Funnel() {
  const [days, setDays] = useState<"7" | "30" | "90">("7");
  const q = useQuery({ queryKey: ["admin", "funnel", days], queryFn: () => adminApi<FunnelData>(`/growth/funnel?days=${days}`), refetchInterval: 60_000 });
  const d = q.data;
  const sum = (src: Record<string, number> | undefined, ids: string[]) => ids.reduce((s, k) => s + (src?.[k] ?? 0), 0);
  const top = d ? Math.max(1, sum(d.now, ["visit"])) : 1;
  return <Panel title="Funnel" icon={TrendingUp} action={<Segmented label="Period" value={days} onChange={setDays} options={[{ id: "7", label: "7 days" }, { id: "30", label: "30 days" }, { id: "90", label: "90 days" }]} />}>
    {!d ? <Skeleton rows={1} h="h-32" /> : !d.installed ? <p className="text-sm text-muted-foreground">Run the “Funnel counters” section of init_database.sql in Supabase to start counting.</p> : <>
      <ol className="grid gap-3 sm:grid-cols-5">{STEPS.map((s, i) => {
        const n = sum(d.now, s.ids), prev = sum(d.before, s.ids), stepBefore = i ? sum(d.now, STEPS[i - 1]!.ids) : null;
        const change = prev ? Math.round(((n - prev) / prev) * 100) : null;
        return <li key={s.id} className="rounded-xl border-2 border-foreground/15 p-3">
          <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
          <p className="font-display text-3xl font-bold tabular-nums">{n.toLocaleString("en-IN")}</p>
          <div className="mt-2 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (n / top) * 100)}%` }} /></div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{stepBefore ? `${Math.round((n / Math.max(1, stepBefore)) * 100)}% of the step before` : "Where it starts"}{change != null && <> · <b className={change >= 0 ? "text-flag-green" : "text-flag-red"}>{change >= 0 ? "+" : ""}{change}%</b></>}</p>
        </li>;
      })}</ol>
      <p className="mt-3 text-xs text-muted-foreground">Daily totals only; nothing about who. The change compares with the {d.days} days before.</p>
    </>}
  </Panel>;
}

export function GrowthPage() {
  const report = useQuery({ queryKey: ["admin", "growth-report"], queryFn: () => adminApi<Report>("/growth/report") });
  const r = report.data;
  return <>
    <PageHead eyebrow="Control" title="Growth" copy="Post one real finding a week, and answer “anyone interviewed at X?” threads with the company page. Data posts get shared; sign-up asks don't." />
    <Funnel />
    <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <Panel title="This week's Ghosting Report" icon={Megaphone}>
        {!r ? <Skeleton rows={3} h="h-28" /> : !r.ready
          ? <div className="rounded-lg border-2 border-dashed border-foreground/30 p-6 text-center">
              <p className="font-display text-lg font-bold">{r.stories} of {r.needed} stories so far</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Findings unlock at {r.needed} published stories, so every number means something. Until then, share the Ghost-o-meter and company pages.</p>
              <div className="relative mx-auto mt-4 h-2.5 max-w-xs rounded-full border-2 border-foreground bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(r.stories / r.needed) * 100}%` }} /></div>
            </div>
          : <ul className="space-y-4">{r.findings.map((f, i) => <li key={f.id} className={cn("rounded-xl border-2 p-4", i === 0 ? "border-foreground bg-accent shadow-hard-sm" : "border-foreground/15")}>
              {i === 0 && <p className="mb-1 text-xs font-bold text-primary">Suggested for this week</p>}
              <p className="font-display text-lg font-bold">{f.headline}</p>
              <p className="text-sm text-muted-foreground">{f.detail}</p>
              <a href={f.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-xs font-semibold text-primary hover:underline"><ExternalLink className="size-3" />{f.link}</a>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton text={f.linkedin} label="Copy LinkedIn post" icon={Linkedin} />
                <CopyButton text={f.x} label="Copy X post" icon={Twitter} />
              </div>
            </li>)}</ul>}
        <p className="mt-4 text-xs text-muted-foreground">Links show the page's preview card automatically. Use <b>#GhostedReceipts</b> on every post.</p>
      </Panel>
      <ReplyHelper />
    </div>
  </>;
}

function ReplyHelper() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const res = useQuery({ queryKey: ["admin", "growth-reply", term], queryFn: () => adminApi<{ items: Reply[] }>(`/growth/reply?q=${encodeURIComponent(term)}`), enabled: term.length >= 2 });
  return <Panel title="Answer a thread" icon={MessageCircleReply} className="h-fit">
    <p className="text-sm text-muted-foreground">Someone asked about a company on LinkedIn or Reddit? Look it up and copy a helpful reply that links to its page.</p>
    <label className="mt-3 flex h-11 items-center gap-2 rounded-lg border-2 border-foreground bg-card px-3"><Search className="size-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
    <div className="mt-3">{term.length < 2 ? null : res.isPending ? <Skeleton rows={2} h="h-24" /> : !res.data?.items.length ? <Empty icon={Search} title="No company by that name" /> :
      <ul className="space-y-3">{res.data.items.map((it) => <li key={it.slug} className={cn(card, "p-3")}>
        <p className="font-bold">{it.name} <span className="text-xs font-normal text-muted-foreground">{it.stories} {it.stories === 1 ? "story" : "stories"}</span></p>
        <p className="mt-1 text-sm">{it.reply}</p>
        <div className="mt-2 flex flex-wrap gap-2"><CopyButton text={it.reply} label="Copy reply" /><Button size="sm" variant="ghost" asChild><a href={it.url} target="_blank" rel="noopener noreferrer"><ExternalLink />Open page</a></Button></div>
      </li>)}</ul>}</div>
  </Panel>;
}
