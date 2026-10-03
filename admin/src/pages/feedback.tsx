// Bugs, ideas and feedback from /feedback: read, set a status, reply (the author is notified).
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LoadMore, useAdminList } from "../paging";
import { Bug, Lightbulb, Loader2, MessageSquareHeart, Monitor, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiRequestError } from "@/lib/api";
import { adminApi } from "../api";
import { ago, card, Chip, Empty, PageHead, Segmented } from "../ui";
import { FeedbackSkeleton } from "../page-skeletons";
import { cn } from "@/lib/utils";

type Item = { publicId: string; kind: "bug" | "feature" | "feedback"; title: string | null; body: string | null; area: string | null; severity: string | null; rating: number | null; steps: string | null; device: Record<string, string> | null; status: string; reply: string | null; created_at: string; author: { handle: string; publicId: string | null } };
const STATUSES: [string, string][] = [["new", "New"], ["seen", "Read"], ["planned", "Planned"], ["in_progress", "In progress"], ["done", "Done"], ["wont_do", "Not for now"]];
const KIND_ICON = { bug: Bug, feature: Lightbulb, feedback: MessageSquareHeart } as const;
const SEV_TONE: Record<string, string> = { blocking: "bg-flag-red text-primary-foreground", annoying: "bg-flag-amber/30", minor: "bg-muted" };

function Detail({ it, onSaved }: { it: Item; onSaved: () => void }) {
  const [status, setStatus] = useState(it.status);
  const [reply, setReply] = useState(it.reply ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStatus(it.status === "new" ? "seen" : it.status); setReply(it.reply ?? ""); }, [it.publicId]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async () => {
    setBusy(true);
    try { await adminApi(`/feedback/${it.publicId}`, { method: "PATCH", body: { status, ...(reply.trim() !== (it.reply ?? "") && { reply: reply.trim() }) } }); toast.success("Saved. The author was notified."); onSaved(); }
    catch (e) { toast.error(e instanceof ApiRequestError ? e.message : "Couldn't save."); }
    finally { setBusy(false); }
  };
  const Icon = KIND_ICON[it.kind];
  return <div className={cn(card, "space-y-4 p-5")}>
    <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg border-2 border-foreground bg-accent"><Icon className="size-5" /></span>
      <div className="min-w-0"><h2 className="font-display text-xl font-bold">{it.title ?? "Feedback"}</h2><p className="text-xs text-muted-foreground">{it.author.handle} · {ago(it.created_at)}{it.area && ` · ${it.area.replace(/_/g, " ")}`}</p></div></div>
    <div className="flex flex-wrap gap-1.5">{it.severity && <Chip tone={SEV_TONE[it.severity]}>{it.severity}</Chip>}{it.rating && <Chip><Star className="size-3 fill-flag-amber" />{it.rating}/5</Chip>}</div>
    {it.body && <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{it.body}</p>}
    {it.steps && <div><p className="text-xs font-bold uppercase text-muted-foreground">Steps to reproduce</p><p className="mt-1 whitespace-pre-wrap font-mono text-xs">{it.steps}</p></div>}
    {it.device && <div className="rounded-lg border-2 border-foreground/15 p-3 text-xs"><p className="mb-1 flex items-center gap-1.5 font-bold"><Monitor className="size-3.5" />Device</p>{Object.entries(it.device).map(([k, v]) => <p key={k} className="break-all"><span className="text-muted-foreground">{k}:</span> {v}</p>)}</div>}
    <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
      <div><span className="mb-1.5 block text-sm font-bold">Status</span>
        <Select value={status} onValueChange={setStatus}><SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
      <label><span className="mb-1.5 block text-sm font-bold">Reply to the author <span className="font-normal text-muted-foreground">(optional, they see it)</span></span>
        <Textarea value={reply} onChange={(e) => setReply(e.target.value.slice(0, 2000))} rows={3} className="rounded-lg border-2 border-foreground bg-background" placeholder="Thanks! Fixed in today's update." /></label>
    </div>
    <div className="flex justify-end"><Button onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Save</Button></div>
  </div>;
}

export function FeedbackPage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"all" | "bug" | "feature" | "feedback">("all");
  const [status, setStatus] = useState<"open" | "done" | "all">("open");
  const list = useAdminList<Item>(["admin", "feedback", kind, status], `/feedback?kind=${kind}&status=${status === "done" ? "done" : status}`);
  const q = { isPending: list.loading };
  const [sel, setSel] = useState<string | null>(null);
  const items = list.items;
  const current = items.find((i) => i.publicId === sel) ?? items[0] ?? null;
  return <>
    <PageHead eyebrow="Community" title="Feedback" copy="From the /feedback page. Status changes and replies are sent to the author's notifications." action={<div className="flex flex-wrap gap-2">
      <Segmented label="Kind" value={kind} onChange={setKind} options={[{ id: "all", label: "All" }, { id: "bug", label: "Bugs" }, { id: "feature", label: "Ideas" }, { id: "feedback", label: "Feedback" }]} />
      <Segmented label="Status" value={status} onChange={setStatus} options={[{ id: "open", label: "Open" }, { id: "done", label: "Done" }, { id: "all", label: "All" }]} />
    </div>} />
    {q.isPending ? <FeedbackSkeleton /> : !items.length ? <Empty icon={MessageSquareHeart} title="Nothing here" copy="No feedback matches these filters." />
      : <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <ul className={cn(card, "max-h-[38vh] divide-y-2 divide-foreground/10 overflow-y-auto lg:max-h-[70vh]")} data-lenis-prevent>{items.map((it) => { const Icon = KIND_ICON[it.kind]; return <li key={it.publicId}>
          <button type="button" onClick={() => setSel(it.publicId)} className={cn("flex w-full items-start gap-2.5 p-3 text-left transition-colors", current?.publicId === it.publicId ? "bg-primary/10" : "hover:bg-muted")}>
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-sm font-bold">{it.title ?? "Feedback"}</span>{it.status === "new" && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="New" />}</span>
              <span className="block truncate text-xs text-muted-foreground">{STATUSES.find(([v]) => v === it.status)?.[1]} · {ago(it.created_at)}</span></span>
          </button></li>; })}<li><LoadMore list={list} noun="items" /></li></ul>
        {current && <Detail key={current.publicId} it={current} onSaved={() => { void qc.invalidateQueries({ queryKey: ["admin", "feedback"] }); void qc.invalidateQueries({ queryKey: ["admin", "overview"] }); }} />}
      </div>}
  </>;
}
