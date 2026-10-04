// Requests & replies: removal / correction requests (with the 24 h acknowledge / 15 day decision
// promise), company reps' official replies (moderators are the only ones who can remove them), and
// Ask candidates questions and answers held by the automatic review.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Check, Clock, ExternalLink, FileWarning, MessageCircleQuestion, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { adminApi, SITE_URL } from "../api";
import { LoadMore, useAdminList } from "../paging";
import { card, Empty, PageHead, Panel, Segmented, Skeleton } from "../ui";

type Request = { publicId: string; kind: "removal" | "factual_error"; target_url: string; email: string; relationship: string; details: string; status: string; resolution: string | null; created_at: string; acknowledged_at: string | null; resolved_at: string | null };
type Item = { publicId: string; body: string; status: string; createdAt: string; company: { name: string; slug: string } | null };

const HOUR = 3_600_000;
const age = (iso: string) => { const h = Math.floor((Date.now() - Date.parse(iso)) / HOUR); return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; };
const RELATION: Record<string, string> = { subject: "It's about them", company: "Represents the company", author: "Wrote it", other: "Other" };

function RequestCard({ r, onDone }: { r: Request; onDone: () => void }) {
  const [note, setNote] = useState(r.resolution ?? "");
  const [busy, setBusy] = useState(false);
  const hours = (Date.now() - Date.parse(r.created_at)) / HOUR;
  // Late against the promise: not acknowledged within 24 h, or not decided within 15 days.
  const late = (!r.acknowledged_at && hours > 24) || (!r.resolved_at && hours > 15 * 24);
  const act = async (status: "acknowledged" | "resolved" | "declined") => {
    setBusy(true);
    try { await adminApi(`/voice/requests/${r.publicId}`, { method: "POST", body: { status, ...(note.trim() && { resolution: note.trim() }) } }); toast.success(status === "acknowledged" ? "Marked acknowledged. Email the requester to confirm." : "Decision saved. Email the requester with it."); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <li className={cn(card, "p-4", late && "border-flag-red")}>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={cn("rounded-full px-2 py-0.5 font-bold", r.kind === "removal" ? "bg-flag-red text-primary-foreground" : "bg-flag-amber text-foreground")}>{r.kind === "removal" ? "Removal" : "Factual error"}</span>
      <span className="font-bold">{RELATION[r.relationship] ?? r.relationship}</span>
      <span className="text-muted-foreground">#{r.publicId} · {age(r.created_at)}</span>
      {late && <span className="inline-flex items-center gap-1 font-bold text-flag-red"><Clock className="size-3.5" />Past the promised time</span>}
      <span className="ml-auto rounded-full border-2 border-foreground/20 px-2 py-0.5 font-bold capitalize">{r.status}</span>
    </div>
    <a href={r.target_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-sm font-bold text-primary hover:underline"><ExternalLink className="size-3.5 shrink-0" />{r.target_url}</a>
    <p className="mt-2 whitespace-pre-wrap text-sm">{r.details}</p>
    <p className="mt-2 text-xs text-muted-foreground">Reply to: <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Your Ghosted request #${r.publicId}`)}`} className="font-bold text-foreground hover:underline">{r.email}</a></p>
    {(r.status === "open" || r.status === "acknowledged") && <div className="mt-3 space-y-2">
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Decision note (kept with the request): what you did and why." className="border-2 border-foreground" />
      <div className="flex flex-wrap gap-2">
        {r.status === "open" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("acknowledged")}><Check />Acknowledge</Button>}
        <Button size="sm" disabled={busy} onClick={() => void act("resolved")}><Check />Resolve</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("declined")}>Decline</Button>
      </div>
    </div>}
    {r.resolution && r.status !== "open" && r.status !== "acknowledged" && <p className="mt-2 rounded-lg bg-muted/60 p-2 text-xs"><b>Decision:</b> {r.resolution}</p>}
  </li>;
}

function Requests() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"open" | "resolved" | "declined" | "all">("open");
  const list = useAdminList<Request>(["admin", "voice", "requests", status], `/voice/requests?status=${status}`);
  return <Panel title="Removal and correction requests" icon={FileWarning} action={<Segmented label="Status" value={status} onChange={setStatus} options={[{ id: "open", label: "Open" }, { id: "resolved", label: "Resolved" }, { id: "declined", label: "Declined" }, { id: "all", label: "All" }]} />}>
    <p className="mb-3 text-xs text-muted-foreground">Promise shown to requesters: acknowledged within 24 hours, decided within 15 days. Oldest first. We don't remove honest experiences just because they're negative.</p>
    {list.loading ? <Skeleton rows={3} /> : !list.items.length ? <Empty icon={FileWarning} title="Nothing waiting" /> : <ul className="space-y-3">{list.items.map((r) => <RequestCard key={r.publicId} r={r} onDone={() => void qc.invalidateQueries({ queryKey: ["admin", "voice", "requests"] })} />)}</ul>}
    <LoadMore list={list} noun="requests" />
  </Panel>;
}

function Items({ kind }: { kind: "rep_reply" | "question" | "answer" }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"pending" | "published">(kind === "rep_reply" ? "published" : "pending");
  const list = useAdminList<Item>(["admin", "voice", kind, status], `/voice/items?kind=${kind}&status=${status}`);
  const act = async (id: string, action: "approve" | "remove") => {
    const reason = action === "remove" && kind === "rep_reply" ? window.prompt("Why is this reply coming down? (Kept on record.)") ?? "" : "";
    if (action === "remove" && !window.confirm("Remove it? It disappears from the site.")) return;
    try { await adminApi(`/voice/items/${kind}/${id}`, { method: "POST", body: { action, ...(reason.trim() && { reason: reason.trim() }) } }); toast.success(action === "approve" ? "Approved. It's live." : "Removed."); void qc.invalidateQueries({ queryKey: ["admin", "voice", kind] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const title = kind === "rep_reply" ? "Company replies" : kind === "question" ? "Questions" : "Answers";
  return <Panel title={title} icon={kind === "rep_reply" ? BadgeCheck : MessageCircleQuestion} action={<Segmented label="Status" value={status} onChange={setStatus} options={[{ id: "pending", label: "Held" }, { id: "published", label: "Live" }]} />}>
    {kind === "rep_reply" && <p className="mb-3 text-xs text-muted-foreground">Verified company representatives get one reply per story and one on the company page. They can't edit or delete them; you're the only ones who can remove one.</p>}
    {list.loading ? <Skeleton rows={2} /> : !list.items.length ? <Empty icon={Check} title={status === "pending" ? "Nothing held" : "Nothing yet"} /> : <ul className="space-y-3">{list.items.map((it) => <li key={it.publicId} className={cn(card, "p-3")}>
      <p className="text-xs text-muted-foreground"><b className="text-foreground">{it.company?.name ?? "Unknown company"}</b> · #{it.publicId} · {age(it.createdAt)}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{it.body}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {it.status === "pending" && <Button size="sm" onClick={() => void act(it.publicId, "approve")}><Check />Approve</Button>}
        <Button size="sm" variant="outline" className="text-flag-red" onClick={() => void act(it.publicId, "remove")}><Trash2 />Remove</Button>
        {it.company && <Button size="sm" variant="ghost" asChild><a href={`${SITE_URL}/c/${it.company.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink />Company page</a></Button>}
      </div>
    </li>)}</ul>}
    <LoadMore list={list} noun="items" />
  </Panel>;
}

export function VoicePage() {
  const [tab, setTab] = useState<"requests" | "rep_reply" | "question" | "answer">("requests");
  return <>
    <PageHead eyebrow="Moderation" title="Requests & replies" copy="Removal and correction requests, company replies, and Ask candidates posts held for a check." />
    <div className="mb-4"><Segmented label="Section" value={tab} onChange={setTab} options={[{ id: "requests", label: "Requests" }, { id: "rep_reply", label: "Company replies" }, { id: "question", label: "Questions" }, { id: "answer", label: "Answers" }]} /></div>
    {tab === "requests" ? <Requests /> : <Items key={tab} kind={tab} />}
  </>;
}
