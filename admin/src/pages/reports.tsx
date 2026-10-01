// Everything people reported, grouped by what was reported, most urgent first.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, ExternalLink, Flag, Loader2, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiRequestError } from "@/lib/api";
import { adminApi, SITE_URL } from "../api";
import { ago, card, Chip, Empty, PageHead, Segmented, useConfirm } from "../ui";
import { ModerationSkeleton } from "../page-skeletons";
import { cn } from "@/lib/utils";

type Group = { kind: "story" | "chitchat" | "company" | "profile"; ref: string; title: string; excerpt: string; status: string | null; priority: number; autoHidden: boolean; link: string | null; reports: { id: string; reason: string; details: string | null; at: string }[] };
type Filter = "all" | Group["kind"];

function GroupCard({ g, onDone }: { g: Group; onDone: () => void }) {
  const { ask, confirmation } = useConfirm();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (outcome: "upheld" | "dismissed") => {
    setBusy(outcome);
    try { await adminApi(`/reports/${g.kind}/${g.ref}`, { method: "POST", body: { outcome, ...(note.trim() && { note: note.trim() }) } }); toast.success(outcome === "upheld" ? "Taken down. Reporters' trust goes up." : "Dismissed. It stays up."); onDone(); }
    catch (e) { toast.error(e instanceof ApiRequestError ? e.message : "Couldn't do that."); }
    finally { setBusy(null); }
  };
  const reasons = [...new Set(g.reports.map((r) => r.reason.replace(/_/g, " ")))];
  return <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className={cn(card, "overflow-hidden")}>
    <div className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-2">
        <Chip tone="bg-card">{g.kind}</Chip>
        <Chip tone={g.priority >= 70 ? "bg-flag-red text-primary-foreground" : g.priority >= 40 ? "bg-flag-amber/30" : "bg-muted"}>Priority {g.priority}</Chip>
        {g.autoHidden && <Chip tone="bg-primary/15 text-primary">Hidden by Goofy</Chip>}
        {g.status && g.status !== "published" && g.status !== "listed" && <Chip>{g.status}</Chip>}
        <span className="basis-full text-xs text-muted-foreground sm:ml-auto sm:basis-auto">{g.reports.length} report{g.reports.length === 1 ? "" : "s"} · latest {ago(g.reports.map((r) => r.at).sort().at(-1))}</span>
      </div>
      <div><h3 className="font-display text-lg font-bold">{g.title}</h3><p className="mt-1 line-clamp-4 text-sm text-muted-foreground">{g.excerpt}</p></div>
      <div className="flex flex-wrap gap-1.5">{reasons.map((r) => <Chip key={r} tone="bg-flag-red/10 text-flag-red">{r}</Chip>)}</div>
      {g.reports.some((r) => r.details) && <ul className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs">{g.reports.filter((r) => r.details).slice(0, 5).map((r) => <li key={r.id} className="whitespace-pre-wrap">{r.details}</li>)}</ul>}
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t-2 border-foreground/10 bg-muted/40 px-4 py-3 sm:px-5">
      <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Note for the log (and the author, if taken down)" className="h-9 min-w-0 basis-full rounded-lg border-2 border-foreground/30 bg-background text-sm sm:flex-1 sm:basis-auto" />
      <Button size="sm" className="flex-1 sm:flex-none" variant="destructive" onClick={() => void ask({ title: `Take down this ${g.kind}?`, copy: "The reports will be upheld, the content will be hidden, and the author and reporter-trust records may be affected.", confirm: "Take down", danger: true }).then((ok) => ok && decide("upheld"))} disabled={!!busy}>{busy === "upheld" ? <Loader2 className="animate-spin" /> : <ShieldX />}Take down</Button>
      <Button size="sm" className="flex-1 sm:flex-none" variant="outline" onClick={() => void ask({ title: "Dismiss these reports?", copy: "The content will remain available and the reporters' trust records may be affected.", confirm: "Dismiss reports" }).then((ok) => ok && decide("dismissed"))} disabled={!!busy}>{busy === "dismissed" ? <Loader2 className="animate-spin" /> : <Check />}Dismiss</Button>
      {g.link && <a href={`${SITE_URL}${g.link}`} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ExternalLink className="size-3.5" />Open</a>}
    </div>{confirmation}
  </motion.li>;
}

export function ReportsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const q = useQuery({ queryKey: ["admin", "reports"], queryFn: () => adminApi<{ groups: Group[] }>("/reports"), refetchInterval: 30_000 });
  const groups = (q.data?.groups ?? []).filter((g) => filter === "all" || g.kind === filter);
  const count = (k: Filter) => (q.data?.groups ?? []).filter((g) => k === "all" || g.kind === k).length;
  const done = () => { void qc.invalidateQueries({ queryKey: ["admin", "reports"] }); void qc.invalidateQueries({ queryKey: ["admin", "overview"] }); };
  return <>
    <PageHead eyebrow="Moderation" title="Reports" copy="Ranked by Goofy's triage: how serious, how many trusted people, how risky the content looks. Your decision teaches reporter trust."
      action={<Segmented label="Type" value={filter} onChange={setFilter} options={(["all", "story", "chitchat", "company", "profile"] as Filter[]).map((k) => ({ id: k, label: k === "all" ? "All" : `${k[0]!.toUpperCase()}${k.slice(1)}s`, count: count(k) }))} />} />
    {q.isPending ? <ModerationSkeleton reports /> : !groups.length ? <Empty icon={Flag} title="No open reports" copy="Everything reported has been decided." />
      : <ul className="space-y-4"><AnimatePresence initial={false}>{groups.map((g) => <GroupCard key={`${g.kind}:${g.ref}`} g={g} onDone={done} />)}</AnimatePresence></ul>}
  </>;
}
