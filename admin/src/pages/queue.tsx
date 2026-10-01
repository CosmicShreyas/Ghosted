// Posts Goofy held because they need a human: approve, approve with names hidden, or remove.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, EyeOff, ExternalLink, Flag, HeartPulse, Hourglass, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiRequestError } from "@/lib/api";
import { adminApi, SITE_URL } from "../api";
import { ago, card, Chip, Empty, PageHead, Segmented, useConfirm } from "../ui";
import { ModerationSkeleton } from "../page-skeletons";
import { cn } from "@/lib/utils";

type Item = {
  kind: "story" | "chitchat"; publicId: string; title: string | null; body: string; outcome: string | null; stage: string | null; createdAt: string;
  author: { handle: string; publicId: string | null }; company: { name: string; slug: string } | null; story: { publicId: string; title: string } | null;
  review: { decision: string | null; score: number | null; reasons: { code: string; detail: string }[]; selfHarm: boolean; askedAt: string | null } | null;
  reports: { reason: string; details: string | null; priority: number }[];
};
const REASON_TONE: Record<string, string> = { pii: "bg-flag-red/15 text-flag-red", defamation_risk: "bg-flag-amber/25", targeted_abuse: "bg-flag-red/15 text-flag-red", sexual_abuse: "bg-flag-red/15 text-flag-red", self_harm: "bg-primary/15 text-primary", spam: "bg-muted", links: "bg-muted", duplicate: "bg-muted" };

function QueueCard({ it, onDone }: { it: Item; onDone: () => void }) {
  const { ask, confirmation } = useConfirm();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const act = async (action: "approve" | "redact" | "remove") => {
    setBusy(action);
    try { await adminApi(`/queue/${it.kind}/${it.publicId}`, { method: "POST", body: { action, ...(note.trim() && { note: note.trim() }) } }); toast.success(action === "remove" ? "Removed. The author was told." : action === "redact" ? "Published with names hidden." : "Approved and published."); onDone(); }
    catch (e) { toast.error(e instanceof ApiRequestError ? e.message : "Couldn't do that."); }
    finally { setBusy(null); }
  };
  const link = it.kind === "story" ? `${SITE_URL}/s/${it.publicId}` : it.story ? `${SITE_URL}/s/${it.story.publicId}` : null;
  return <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} className={cn(card, "overflow-hidden")}>
    <div className="space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{it.author.handle}{it.company && <> about <span className="font-semibold text-foreground">{it.company.name}</span></>}{it.story && <> on “{it.story.title}”</>} · {ago(it.createdAt)}</p>
          {it.title && <h3 className="mt-0.5 font-display text-lg font-bold">{it.title}</h3>}
        </div>
        {it.review?.score != null && <Chip tone={it.review.score >= 0.7 ? "bg-flag-red/15 text-flag-red" : "bg-flag-amber/25"}>Risk {Math.round(it.review.score * 100)}</Chip>}
      </div>
      {it.review?.selfHarm && <p className="flex items-start gap-2 rounded-lg border-2 border-primary bg-primary/10 p-3 text-sm"><HeartPulse className="mt-0.5 size-4 shrink-0 text-primary" />Mentions self-harm. The author was shown the Tele-MANAS helpline (14416). Consider reaching out kindly before deciding.</p>}
      <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm leading-relaxed" data-lenis-prevent>{it.body}</p>
      {it.review?.reasons.length ? <div className="flex flex-wrap gap-1.5"><span className="text-xs font-bold text-muted-foreground">Goofy flagged:</span>{it.review.reasons.map((r, i) => <Chip key={i} tone={REASON_TONE[r.code] ?? "bg-muted"}>{r.detail}</Chip>)}</div> : null}
      {it.reports.length > 0 && <div className="rounded-lg border-2 border-foreground/15 p-3"><p className="flex items-center gap-1.5 text-xs font-bold"><Flag className="size-3.5 text-flag-red" />{it.reports.length} open report{it.reports.length === 1 ? "" : "s"}</p>
        <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">{it.reports.slice(0, 4).map((r, i) => <li key={i}><span className="font-semibold text-foreground">{r.reason.replace(/_/g, " ")}</span>{r.details && `: ${r.details.slice(0, 140)}`}</li>)}</ul></div>}
    </div>
    <div className="flex flex-wrap items-center gap-2 border-t-2 border-foreground/10 bg-muted/40 px-4 py-3 sm:px-5">
      <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Note for the author and the log (optional)" className="h-9 min-w-0 basis-full rounded-lg border-2 border-foreground/30 bg-background text-sm sm:flex-1 sm:basis-auto" />
      <Button size="sm" className="flex-1 sm:flex-none" onClick={() => void ask({ title: `Approve this ${it.kind}?`, copy: "It will become public immediately and the author will be notified.", confirm: "Approve and publish" }).then((ok) => ok && act("approve"))} disabled={!!busy}>{busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />}Approve</Button>
      <Button size="sm" className="flex-1 sm:flex-none" variant="outline" onClick={() => void ask({ title: "Hide names and publish?", copy: "Names detected in this content will be replaced with [name], then the result will become public immediately.", confirm: "Redact and publish" }).then((ok) => ok && act("redact"))} disabled={!!busy} title="Replace people's names with [name], then publish">{busy === "redact" ? <Loader2 className="animate-spin" /> : <EyeOff />}Hide names</Button>
      <Button size="sm" className="flex-1 sm:flex-none" variant="destructive" onClick={() => void ask({ title: `Remove this ${it.kind}?`, copy: "It will not be published, the author will be notified, and the decision will be written to the audit log.", confirm: "Remove content", danger: true }).then((ok) => ok && act("remove"))} disabled={!!busy}>{busy === "remove" ? <Loader2 className="animate-spin" /> : <Trash2 />}Remove</Button>
      {link && <a href={link} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"><ExternalLink className="size-3.5" />Context</a>}
    </div>{confirmation}
  </motion.li>;
}

export function QueuePage() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"story" | "chitchat">("story");
  const q = useQuery({ queryKey: ["admin", "queue", kind], queryFn: () => adminApi<{ items: Item[] }>(`/queue?kind=${kind}`), refetchInterval: 30_000 });
  const done = () => { void qc.invalidateQueries({ queryKey: ["admin", "queue"] }); void qc.invalidateQueries({ queryKey: ["admin", "overview"] }); };
  return <>
    <PageHead eyebrow="Moderation" title="Held for review" copy="Posts Goofy wasn't sure about. Approving or removing tells the author and settles any open reports." action={<Segmented label="Kind" value={kind} onChange={setKind} options={[{ id: "story", label: "Stories" }, { id: "chitchat", label: "Chitchats" }]} />} />
    {q.isPending ? <ModerationSkeleton count={2} /> : !q.data?.items.length ? <Empty icon={Hourglass} title="Nothing waiting" copy={`No held ${kind === "story" ? "stories" : "chitchats"}. Goofy's handling the rest.`} />
      : <ul className="space-y-4"><AnimatePresence initial={false}>{q.data.items.map((it) => <QueueCard key={it.publicId} it={it} onDone={done} />)}</AnimatePresence></ul>}
  </>;
}
