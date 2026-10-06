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

type Request = { publicId: string; kind: "removal" | "factual_error"; target_url: string; email: string; relationship: string; details: string; status: string; resolution: string | null; created_at: string; acknowledged_at: string | null; resolved_at: string | null; basis?: string | null; good_faith?: boolean | null; outcome?: string | null };
type Item = { publicId: string; body: string; status: string; createdAt: string; company: { name: string; slug: string } | null };

const HOUR = 3_600_000;
const age = (iso: string) => { const h = Math.floor((Date.now() - Date.parse(iso)) / HOUR); return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; };
const RELATION: Record<string, string> = { subject: "It's about them", company: "Represents the company", author: "Wrote it", other: "Other" };

// The takedown process (backend/src/takedown.ts): acknowledging emails the requester and tells the
// story's author (72 hours to respond); a decision needs an outcome and reasons, which are emailed.
const OUTCOMES = [["no_action", "No action (stays up)"], ["author_corrected", "Author corrected it"], ["redacted", "Redacted part of it"], ["removed", "Removed it"], ["other", "Other"]] as const;
const BASIS: Record<string, string> = { defamation: "Defamation", false_fact: "Factual error", personal_data: "Personal data", confidential: "Confidential", harassment: "Harassment", impersonation: "Impersonation / intimate images (urgent)", copyright: "Copyright", other: "Other" };
function RequestCard({ r, onDone }: { r: Request; onDone: () => void }) {
  const [note, setNote] = useState(r.resolution ?? "");
  const [outcome, setOutcome] = useState<string>(r.outcome ?? "");
  const [busy, setBusy] = useState(false);
  const hours = (Date.now() - Date.parse(r.created_at)) / HOUR;
  // Late against the promise: not acknowledged within 24 h, or not decided within 15 days.
  const late = (!r.acknowledged_at && hours > 24) || (!r.resolved_at && hours > 15 * 24);
  // The author's 72 hours to respond, from acknowledgement (not for urgent unlawful content).
  const authorWindowLeft = r.acknowledged_at ? 72 - (Date.now() - Date.parse(r.acknowledged_at)) / HOUR : null;
  const act = async (status: "acknowledged" | "resolved" | "declined") => {
    if (status !== "acknowledged" && (!outcome || note.trim().length < 10)) { toast.error("Pick the outcome and write the reasons first: they're emailed to the requester."); return; }
    if (status !== "acknowledged" && outcome === "removed" && authorWindowLeft != null && authorWindowLeft > 0 && r.basis !== "impersonation" && !window.confirm(`The author still has about ${Math.ceil(authorWindowLeft)} hours to respond. Remove anyway?`)) return;
    setBusy(true);
    try { await adminApi(`/voice/requests/${r.publicId}`, { method: "POST", body: { status, ...(note.trim() && { resolution: note.trim() }), ...(status !== "acknowledged" && { outcome }) } }); toast.success(status === "acknowledged" ? "Acknowledged. The requester was emailed and the author told." : "Decision saved and emailed to the requester. The author was told."); onDone(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <li className={cn(card, "p-4", late && "border-flag-red")}>
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className={cn("rounded-full px-2 py-0.5 font-bold", r.kind === "removal" ? "bg-flag-red text-primary-foreground" : "bg-flag-amber text-foreground")}>{r.kind === "removal" ? "Removal" : "Factual error"}</span>
      <span className="font-bold">{RELATION[r.relationship] ?? r.relationship}</span>
      {r.basis && <span className={cn("rounded-full border-2 px-2 py-0.5 font-bold", r.basis === "impersonation" ? "border-flag-red text-flag-red" : "border-foreground/20")}>{BASIS[r.basis] ?? r.basis}</span>}
      {r.good_faith && <span className="font-semibold text-muted-foreground">good-faith statement given</span>}
      {authorWindowLeft != null && authorWindowLeft > 0 && !r.resolved_at && <span className="font-semibold text-muted-foreground">author has ~{Math.ceil(authorWindowLeft)}h to respond</span>}
      <span className="text-muted-foreground">#{r.publicId} · {age(r.created_at)}</span>
      {late && <span className="inline-flex items-center gap-1 font-bold text-flag-red"><Clock className="size-3.5" />Past the promised time</span>}
      <span className="ml-auto rounded-full border-2 border-foreground/20 px-2 py-0.5 font-bold capitalize">{r.status}</span>
    </div>
    <a href={r.target_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-sm font-bold text-primary hover:underline"><ExternalLink className="size-3.5 shrink-0" />{r.target_url}</a>
    <p className="mt-2 whitespace-pre-wrap text-sm">{r.details}</p>
    <p className="mt-2 text-xs text-muted-foreground">Reply to: <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Your Ghosted request #${r.publicId}`)}`} className="font-bold text-foreground hover:underline">{r.email}</a></p>
    {(r.status === "open" || r.status === "acknowledged") && <div className="mt-3 space-y-2">
      <select value={outcome} onChange={(e) => setOutcome(e.target.value)} aria-label="Outcome" className="h-10 w-full rounded-md border-2 border-foreground bg-background px-3 text-sm sm:w-auto">
        <option value="">Outcome (needed to resolve or decline)</option>
        {OUTCOMES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="The reasons, in plain words. This is emailed to the requester." className="border-2 border-foreground" />
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

type Kind = "rep_reply" | "question" | "answer" | "change";
function Items({ kind }: { kind: Kind }) {
  const qc = useQueryClient();
  const companyPost = kind === "rep_reply" || kind === "change";
  const [status, setStatus] = useState<"pending" | "published">(companyPost ? "published" : "pending");
  const list = useAdminList<Item>(["admin", "voice", kind, status], `/voice/items?kind=${kind}&status=${status}`);
  const act = async (id: string, action: "approve" | "remove") => {
    const reason = action === "remove" && companyPost ? window.prompt(`Why is this ${kind === "change" ? "change note" : "reply"} coming down? (Kept on record.)`) ?? "" : "";
    if (action === "remove" && !window.confirm("Remove it? It disappears from the site.")) return;
    try { await adminApi(`/voice/items/${kind}/${id}`, { method: "POST", body: { action, ...(reason.trim() && { reason: reason.trim() }) } }); toast.success(action === "approve" ? "Approved. It's live." : "Removed."); void qc.invalidateQueries({ queryKey: ["admin", "voice", kind] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  const title = kind === "rep_reply" ? "Company replies" : kind === "change" ? "Change notes" : kind === "question" ? "Questions" : "Answers";
  return <Panel title={title} icon={companyPost ? BadgeCheck : MessageCircleQuestion} action={<Segmented label="Status" value={status} onChange={setStatus} options={[{ id: "pending", label: "Held" }, { id: "published", label: "Live" }]} />}>
    {kind === "rep_reply" && <p className="mb-3 text-xs text-muted-foreground">Verified company representatives get one reply per story and one on the company page. They can't edit or delete them; you're the only ones who can remove one.</p>}
    {kind === "change" && <p className="mb-3 text-xs text-muted-foreground">"You said, we did" notes: up to 4 a month per representative, each citing 1 to 5 stories. Approving one tells every cited author. Representatives can't edit or delete them; you're the only ones who can remove one.</p>}
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

// Notes reps attached to impact steps (heard, looking into it, fixed). The step itself is permanent;
// moderators can only publish or hide its note.
type Note = { storyPublicId: string; storyTitle: string | null; step: string; body: string; status: string; createdAt: string; company: { name: string; slug: string } | null };
const STEP: Record<string, string> = { heard: "Heard", looking_into_it: "Looking into it", fixed: "Says it's fixed" };
function Notes() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"pending" | "published">("pending");
  const list = useAdminList<Note>(["admin", "voice", "notes", status], `/voice/notes?status=${status}`);
  const act = async (n: Note, action: "approve" | "remove") => {
    if (action === "remove" && !window.confirm("Hide this note? The step stays; only the note disappears.")) return;
    try { await adminApi(`/voice/notes/${n.storyPublicId}/${n.step}`, { method: "POST", body: { action } }); toast.success(action === "approve" ? "Note published." : "Note hidden."); void qc.invalidateQueries({ queryKey: ["admin", "voice", "notes"] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  return <Panel title="Rep step notes" icon={BadgeCheck} action={<Segmented label="Status" value={status} onChange={setStatus} options={[{ id: "pending", label: "Held" }, { id: "published", label: "Live" }]} />}>
    <p className="mb-3 text-xs text-muted-foreground">Short notes a verified representative added when marking a story heard, being looked into or fixed. Steps can't be undone by anyone.</p>
    {list.loading ? <Skeleton rows={2} /> : !list.items.length ? <Empty icon={Check} title={status === "pending" ? "Nothing held" : "Nothing yet"} /> : <ul className="space-y-3">{list.items.map((n) => <li key={`${n.storyPublicId}-${n.step}`} className={cn(card, "p-3")}>
      <p className="text-xs text-muted-foreground"><b className="text-foreground">{n.company?.name ?? "Unknown company"}</b> · {STEP[n.step] ?? n.step} · {age(n.createdAt)}</p>
      {n.storyTitle && <p className="mt-0.5 truncate text-xs">On: {n.storyTitle}</p>}
      <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {n.status === "pending" && <Button size="sm" onClick={() => void act(n, "approve")}><Check />Publish</Button>}
        <Button size="sm" variant="outline" className="text-flag-red" onClick={() => void act(n, "remove")}><Trash2 />Hide note</Button>
        <Button size="sm" variant="ghost" asChild><a href={`${SITE_URL}/s/${n.storyPublicId}`} target="_blank" rel="noopener noreferrer"><ExternalLink />Story</a></Button>
      </div>
    </li>)}</ul>}
    <LoadMore list={list} noun="notes" />
  </Panel>;
}

type PledgeRow = { days: number; made_at: string; withdrawn_at: string | null; withdrawn_by: string | null; badge: string; stories_n: number; kept_n: number; company: { name: string; slug: string } | null };
function Pledges() {
  const qc = useQueryClient();
  const list = useAdminList<PledgeRow>(["admin", "voice", "pledges"], "/voice/pledges");
  const withdraw = async (slug: string) => {
    const reason = window.prompt("Why is this pledge being withdrawn? (Kept on record. The page will show \"Pledge withdrawn\".)") ?? "";
    if (!reason.trim() || !window.confirm("Withdraw this company's pledge?")) return;
    try { await adminApi(`/voice/pledges/${slug}/withdraw`, { method: "POST", body: { reason: reason.trim() } }); toast.success("Pledge withdrawn."); void qc.invalidateQueries({ queryKey: ["admin", "voice", "pledges"] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  return <Panel title="Reply pledges" icon={Clock}>
    <p className="mb-3 text-xs text-muted-foreground">Badges are computed nightly from candidate stories posted after each pledge. Withdrawn pledges stay listed and show as withdrawn on the company page.</p>
    {list.loading ? <Skeleton rows={2} /> : !list.items.length ? <Empty icon={Check} title="No pledges yet" /> : <ul className="space-y-2">{list.items.map((p) => <li key={`${p.company?.slug}-${p.made_at}`} className={cn(card, "flex flex-wrap items-center gap-3 p-3")}>
      <span className="min-w-0 flex-1"><b>{p.company?.name ?? "Unknown"}</b> · {p.days} days · <span className="font-semibold">{p.badge}</span><span className="block text-xs text-muted-foreground">{p.kept_n} of {p.stories_n} stories in time · made {age(p.made_at)}{p.withdrawn_at ? ` · withdrawn by ${p.withdrawn_by ?? "?"} ${age(p.withdrawn_at)}` : ""}</span></span>
      {!p.withdrawn_at && p.company && <Button size="sm" variant="outline" className="text-flag-red" onClick={() => void withdraw(p.company!.slug)}>Withdraw</Button>}
    </li>)}</ul>}
    <LoadMore list={list} noun="pledges" />
  </Panel>;
}

type Rep = { userPublicId: string; handle: string | null; domain: string; verifiedAt: string; revokedAt: string | null; company: { name: string; slug: string } | null };
function Reps() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"active" | "revoked">("active");
  const list = useAdminList<Rep>(["admin", "voice", "reps", status], `/voice/reps?status=${status}`);
  const revoke = async (r: Rep) => {
    const reason = window.prompt(`Why is ${r.handle ?? "this representative"} losing access for ${r.company?.name ?? "this company"}? (Kept on record.)`) ?? "";
    if (reason.trim().length < 3) return;
    if (!window.confirm("Revoke? They lose replies, steps, change notes, pledges and Company Pulse for this company straight away. Everything they already posted stays, and they stay unable to see who wrote about the company.")) return;
    try { await adminApi(`/voice/reps/${r.userPublicId}/${r.company!.slug}/revoke`, { method: "POST", body: { reason: reason.trim() } }); toast.success("Representative revoked."); void qc.invalidateQueries({ queryKey: ["admin", "voice", "reps"] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  return <Panel title="Company representatives" icon={BadgeCheck} action={<Segmented label="Status" value={status} onChange={setStatus} options={[{ id: "active", label: "Active" }, { id: "revoked", label: "Revoked" }]} />}>
    {list.loading ? <Skeleton rows={2} /> : !list.items.length ? <Empty icon={Check} title={status === "active" ? "No verified representatives" : "None revoked"} /> : <ul className="space-y-2">{list.items.map((r) => <li key={`${r.userPublicId}-${r.company?.slug}`} className={cn(card, "flex flex-wrap items-center gap-3 p-3")}>
      <span className="min-w-0 flex-1"><b>{r.company?.name ?? "Unknown"}</b> · @{r.domain}<span className="block text-xs text-muted-foreground">{r.handle ?? "Member"} #{r.userPublicId} · verified {age(r.verifiedAt)}{r.revokedAt ? ` · revoked ${age(r.revokedAt)}` : ""}</span></span>
      {!r.revokedAt && r.company && <Button size="sm" variant="outline" className="text-flag-red" onClick={() => void revoke(r)}>Revoke</Button>}
    </li>)}</ul>}
    <LoadMore list={list} noun="representatives" />
  </Panel>;
}

export function VoicePage() {
  const [tab, setTab] = useState<"requests" | Kind | "notes" | "pledges" | "reps">("requests");
  return <>
    <PageHead eyebrow="Moderation" title="Requests & replies" copy="Removal and correction requests, company replies, and Ask candidates posts held for a check." />
    <div className="mb-4"><Segmented label="Section" value={tab} onChange={setTab} options={[{ id: "requests", label: "Requests" }, { id: "rep_reply", label: "Company replies" }, { id: "notes", label: "Step notes" }, { id: "change", label: "Change notes" }, { id: "pledges", label: "Pledges" }, { id: "reps", label: "Representatives" }, { id: "question", label: "Questions" }, { id: "answer", label: "Answers" }]} /></div>
    {tab === "requests" ? <Requests /> : tab === "notes" ? <Notes /> : tab === "pledges" ? <Pledges /> : tab === "reps" ? <Reps /> : <Items key={tab} kind={tab} />}
  </>;
}
