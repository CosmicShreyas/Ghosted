// Growth: the weekly Ghosting Report (one real finding to post on LinkedIn and X, each linking back
// to a company page) and ready-made replies for "anyone interviewed at X?" threads. Everything is
// written from real published stories; nothing is posted automatically.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Linkedin, Megaphone, MessageCircleReply, Search, Twitter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { adminApi } from "../api";
import { card, Empty, PageHead, Panel, Skeleton } from "../ui";

type Finding = { id: string; headline: string; detail: string; link: string; linkedin: string; x: string };
type Report = { ready: boolean; stories: number; needed: number; findings: Finding[] };
type Reply = { name: string; slug: string; stories: number; url: string; reply: string };

function CopyButton({ text, label, icon: Icon = Copy }: { text: string; label: string; icon?: typeof Copy }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); toast.success("Copied."); setTimeout(() => setDone(false), 1500); } catch { toast.error("Couldn't copy."); } };
  return <Button size="sm" variant="outline" className="min-h-10" onClick={() => void copy()}>{done ? <Check /> : <Icon />}{label}</Button>;
}

export function GrowthPage() {
  const report = useQuery({ queryKey: ["admin", "growth-report"], queryFn: () => adminApi<Report>("/growth/report") });
  const r = report.data;
  return <>
    <PageHead eyebrow="Control" title="Growth" copy="Post one real finding a week, and answer “anyone interviewed at X?” threads with the company page. Data posts get shared; sign-up asks don't." />
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
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
