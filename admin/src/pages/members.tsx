// Members: find anyone by handle or 15-digit id, see what they've posted and how Goofy has judged
// them, then pause posting, ban the account (and the connections it used), or send a templated
// email. Everything opens as a popup in the middle of the screen. With the "private" permission
// you also see their email, real name and sign-in devices; every look is written to the audit log.
// There is no "sign in as them".
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Ban, Check, Globe, Laptop, Loader2, Mail, PauseCircle, PlayCircle, Search, Send, ShieldAlert, ShieldOff, Smartphone, Tablet, Undo2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { adminApi, SITE_URL, type AdminMe } from "../api";
import { can } from "../perms";
import { ago, card, Chip, Empty, field, Modal, PageHead, Peep, Segmented, Skeleton, useConfirm } from "../ui";
import { MemberGridSkeleton, RuledListSkeleton } from "../page-skeletons";

const fail = (e: unknown) => toast.error(e instanceof ApiRequestError ? e.message : "Couldn't do that.");
type Status = "active" | "paused" | "banned";
type Row = { publicId: string; handle: string; avatarSeed: string; pastel: string; joinedAt: string; status: Status };
type Detail = {
  publicId: string; handle: string; avatarSeed: string; pastel: string; joinedAt: string; tone: "sassy" | "calm"; status: Status; pausedUntil: string | null;
  ban: { at: string; until: string | null; reason: string | null } | null;
  stats: { published: number; held: number; hidden: number; chitchats: number; reported: number; strikes30d: number };
  recent: { publicId: string; title: string; status: string; at: string; company: string | null }[];
  devices: { kind: string; browser: string; os: string; place: string | null; ip: string | null; ipRef: string | null; ipBanned: boolean; lastSeenAt: string }[] | null;
  private: { email: string | null; name: string | null; details: Record<string, unknown> } | null;
  canBan: boolean; canSeePrivate: boolean;
};
const STATUS_CHIP: Record<Status, { label: string; tone: string }> = { active: { label: "Active", tone: "bg-flag-green/15 text-flag-green" }, paused: { label: "Posting paused", tone: "bg-accent" }, banned: { label: "Banned", tone: "bg-flag-red text-primary-foreground" } };
const DEVICE = { mobile: Smartphone, tablet: Tablet, desktop: Laptop } as Record<string, typeof Laptop>;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function MembersPage({ me, focus, onFocused }: { me: AdminMe; focus?: string | null; onFocused?: () => void }) {
  const [tab, setTab] = useState<"members" | "ips">("members");
  useEffect(() => { if (focus) setTab("members"); }, [focus]);
  return <>
    <PageHead eyebrow="People" title="Members" copy="Look anyone up by handle or 15-digit id. Suspensions and bans tell the member in their notifications; every action is logged."
      action={can(me, "ban") ? <Segmented label="View" value={tab} onChange={setTab} options={[{ id: "members", label: "Members" }, { id: "ips", label: "Blocked connections" }]} /> : undefined} />
    {tab === "members" ? <MemberList focus={focus ?? null} onFocused={onFocused} /> : <IpBans />}
  </>;
}

function MemberList({ focus, onFocused }: { focus: string | null; onFocused?: (() => void) | undefined }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "paused" | "banned">("all");
  const [open, setOpen] = useState<string | null>(focus);
  useEffect(() => { if (focus) { setOpen(focus); onFocused?.(); } }, [focus, onFocused]);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const list = useQuery({ queryKey: ["admin", "members", debounced, filter], queryFn: () => adminApi<{ items: Row[] }>(`/members?filter=${filter}${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`) });
  return <>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label className="flex h-11 min-w-0 flex-1 basis-64 items-center gap-2 rounded-lg border-2 border-foreground bg-card px-3"><Search className="size-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Handle or 15-digit id" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      <div className="no-scrollbar -mx-1 overflow-x-auto px-1"><Segmented label="Filter" value={filter} onChange={setFilter} options={[{ id: "all", label: "Everyone" }, { id: "new", label: "New this week" }, { id: "paused", label: "Paused" }, { id: "banned", label: "Banned" }]} /></div>
    </div>
    {list.isPending ? <MemberGridSkeleton /> : !list.data?.items.length ? <Empty icon={Users} title="Nobody matches" copy="Try part of a handle, or paste the 15-digit id from their profile link." />
      : <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{list.data.items.map((m) => <li key={m.publicId}>
        <button type="button" onClick={() => setOpen(m.publicId)} className={cn(card, "card-lift flex w-full items-center gap-3 p-3 text-left")}>
          <Peep seed={m.avatarSeed} pastel={m.pastel} className="size-11" />
          <span className="min-w-0 flex-1"><span className="block truncate font-bold">{m.handle}</span><span className="block text-xs text-muted-foreground">Joined {ago(m.joinedAt)}</span></span>
          {m.status !== "active" && <Chip tone={STATUS_CHIP[m.status].tone}>{STATUS_CHIP[m.status].label}</Chip>}
        </button>
      </li>)}</ul>}
    {open && <MemberModal key={open} publicId={open} onClose={() => setOpen(null)} />}
  </>;
}

function MemberModal({ publicId, onClose }: { publicId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["admin", "member", publicId], queryFn: () => adminApi<Detail>(`/members/${publicId}`) });
  const [action, setAction] = useState<null | "pause" | "ban" | "mail" | "unban">(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin", "member", publicId] }); void qc.invalidateQueries({ queryKey: ["admin", "members"] }); };
  const m = d.data;
  const act = async (path: string, body: unknown, ok: string) => { try { await adminApi(`/members/${publicId}/${path}`, { method: "POST", body }); toast.success(ok); refresh(); setAction(null); } catch (e) { fail(e); } };

  const footer = m && <>
    <Button variant="outline" onClick={() => setAction("mail")}><Mail />Send an email</Button>
    {m.canBan && <>
      {m.status === "paused" ? <Button variant="outline" onClick={() => void act("pause", { days: 0 }, "Posting is back on.")}><PlayCircle />Lift the pause</Button>
        : m.status === "active" && <Button variant="outline" onClick={() => setAction("pause")}><PauseCircle />Pause posting</Button>}
      {m.status === "banned" ? <Button className="sm:ml-auto" onClick={() => setAction("unban")}><Undo2 />Lift the ban</Button>
        : <Button variant="destructive" className="sm:ml-auto" onClick={() => setAction("ban")}><Ban />Ban</Button>}
    </>}
  </>;

  return <>
    <Modal open={!action} onClose={onClose} size="lg" title={m ? m.handle : "Member"} subtitle={m ? `id ${m.publicId}, joined ${fmt(m.joinedAt)}` : "Loading…"} footer={footer}>
      {!m ? <div className="space-y-4"><div className="flex items-center gap-4"><div className="skeleton size-20 rounded-full" /><div className="flex-1 space-y-2"><div className="skeleton h-6 w-40 rounded" /><div className="skeleton h-4 w-28 rounded" /></div></div><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-40 rounded-xl" /></div> : <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          <Peep seed={m.avatarSeed} pastel={m.pastel} className="size-20" />
          <div className="min-w-0 flex-1">
            {m.private?.name && <p className="truncate font-display text-xl font-bold">{m.private.name}</p>}
            <div className="mt-1.5 flex flex-wrap gap-1.5"><Chip tone={STATUS_CHIP[m.status].tone}>{STATUS_CHIP[m.status].label}</Chip><Chip>{m.tone === "sassy" ? "Sassy" : "Calm"} voice</Chip><a href={`${SITE_URL}/u/${m.publicId}`} target="_blank" rel="noopener noreferrer"><Chip tone="bg-card hover:bg-muted">Open profile</Chip></a></div>
          </div>
        </div>

        {m.ban && m.status === "banned" && <p className="rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm"><b>Banned {m.ban.until ? `until ${fmt(m.ban.until)}` : "permanently"}</b>{m.ban.reason && <>: {m.ban.reason}</>}</p>}
        {m.status === "paused" && m.pausedUntil && <p className="rounded-lg border-2 border-foreground bg-accent p-3 text-sm"><b>Posting paused until {fmt(m.pausedUntil)}.</b> They can still read and react.</p>}

        <dl className="grid grid-cols-2 overflow-hidden rounded-xl border-2 border-foreground sm:grid-cols-3">{([["Published", m.stats.published], ["Held", m.stats.held], ["Hidden", m.stats.hidden], ["Chitchats", m.stats.chitchats], ["Reports on them", m.stats.reported], ["Strikes, 30 days", m.stats.strikes30d]] as const).map(([k, v]) =>
          <div key={k} className="border-b-2 border-r-2 border-foreground/10 p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className={cn("font-display text-2xl font-bold tabular-nums", k.startsWith("Strikes") && v > 0 && "text-flag-red")}>{v}</dd></div>)}</dl>

        <div className="grid gap-5 md:grid-cols-2">
          {m.private && <section className="rounded-xl border-2 border-dashed border-foreground/40 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold"><ShieldAlert className="size-4 text-flag-red" />Private details <span className="font-normal text-muted-foreground">(logged)</span></p>
            <dl className="grid gap-1.5 text-sm">
              <div className="flex gap-2"><dt className="w-24 shrink-0 text-muted-foreground">Email</dt><dd className="min-w-0 break-all font-semibold">{m.private.email ?? "None on file"}</dd></div>
              {Object.entries(m.private.details).filter(([k, v]) => v && k !== "name").map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-24 shrink-0 capitalize text-muted-foreground">{k}</dt><dd className="min-w-0 break-all">{String(v)}</dd></div>)}
            </dl>
          </section>}
          <section>
            <p className="mb-2 text-sm font-bold">Latest stories</p>
            {m.recent.length ? <ul className="space-y-1.5">{m.recent.map((s) => <li key={s.publicId}><a href={`${SITE_URL}/s/${s.publicId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border-2 border-foreground/10 px-3 py-2 text-sm hover:border-foreground">
              <span className="min-w-0 flex-1 truncate font-semibold">{s.title}</span>{s.status !== "published" && <Chip>{s.status}</Chip>}<span className="shrink-0 text-xs text-muted-foreground">{ago(s.at)}</span>
            </a></li>)}</ul> : <p className="text-sm text-muted-foreground">Hasn't posted a story yet.</p>}
          </section>
        </div>

        {m.devices && <section>
          <p className="mb-2 text-sm font-bold">Signed-in devices</p>
          {m.devices.length ? <ul className="divide-y-2 divide-foreground/10 rounded-xl border-2 border-foreground">{m.devices.map((dv, i) => { const Icon = DEVICE[dv.kind] ?? Laptop; return <li key={i} className="flex flex-wrap items-center gap-3 p-3">
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 text-sm"><span className="block font-semibold">{dv.browser} on {dv.os}</span><span className="block truncate text-xs text-muted-foreground">{[dv.place, dv.ip, `seen ${ago(dv.lastSeenAt)}`].filter(Boolean).join(", ")}</span></span>
            {dv.ipBanned ? <Chip tone="bg-flag-red text-primary-foreground">Blocked</Chip> : m.canBan && dv.ipRef && <IpBanButton refId={dv.ipRef} member={m.publicId} onDone={refresh} />}
          </li>; })}</ul> : <p className="text-sm text-muted-foreground">No devices on record. They'll appear after the member's next sign-in.</p>}
        </section>}
      </div>}
    </Modal>

    {m && <>
      <PauseModal open={action === "pause"} handle={m.handle} onClose={() => setAction(null)} onSubmit={(days, reason) => void act("pause", { days, reason }, `Posting paused for ${days} day${days === 1 ? "" : "s"}.`)} />
      <BanModal open={action === "ban"} handle={m.handle} canDevices={!!m.devices} onClose={() => setAction(null)} onSubmit={(b) => void act("ban", b, `${m.handle} is banned.`)} />
      <UnbanModal open={action === "unban"} handle={m.handle} onClose={() => setAction(null)} onSubmit={(b) => void act("unban", b, `${m.handle} is restored.`)} />
      <MailWizard open={action === "mail"} member={m} onClose={() => setAction(null)} />
    </>}
  </>;
}

function PauseModal({ open, handle, onClose, onSubmit }: { open: boolean; handle: string; onClose: () => void; onSubmit: (days: number, reason: string) => void }) {
  const [days, setDays] = useState(3);
  const [reason, setReason] = useState("");
  return <Modal open={open} onClose={onClose} size="sm" title={`Pause posting for ${handle}`} subtitle="They keep reading and reacting, and get a notification with your reason."
    footer={<><Button onClick={() => onSubmit(days, reason)}><PauseCircle />Pause for {days} day{days === 1 ? "" : "s"}</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></>}>
    <p className="mb-2 text-sm font-bold">How long</p>
    <div className="flex flex-wrap gap-2">{[1, 3, 7, 30].map((n) => <button key={n} type="button" onClick={() => setDays(n)} className={cn("rounded-full border-2 border-foreground px-3 py-1 text-sm font-bold", days === n ? "bg-foreground text-background" : "bg-card")}>{n} day{n === 1 ? "" : "s"}</button>)}</div>
    <label className="mt-4 block"><span className="mb-1 block text-sm font-bold">Reason they'll see <span className="font-normal text-muted-foreground">(optional)</span></span><Input value={reason} onChange={(e) => setReason(e.target.value)} className={field} maxLength={300} /></label>
  </Modal>;
}

function BanModal({ open, handle, canDevices, onClose, onSubmit }: { open: boolean; handle: string; canDevices: boolean; onClose: () => void; onSubmit: (b: { days: number | null; reason: string; hideContent: boolean; banIps: boolean }) => void }) {
  const [days, setDays] = useState<number | null>(30);
  const [reason, setReason] = useState("");
  const [hide, setHide] = useState(false);
  const [ips, setIps] = useState(false);
  const [confirm, setConfirm] = useState("");
  return <Modal open={open} onClose={onClose} tone="danger" title={`Ban ${handle}`} subtitle="Signs them out everywhere and blocks signing in. They can still read Ghosted as a visitor."
    footer={<><Button variant="destructive" disabled={reason.trim().length < 3 || confirm !== handle} onClick={() => onSubmit({ days, reason: reason.trim(), hideContent: hide, banIps: ips })}><Ban />Ban {days ? `for ${days} days` : "permanently"}</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></>}>
    <p className="mb-2 text-sm font-bold">How long</p>
    <div className="flex flex-wrap gap-2">{([[7, "7 days"], [30, "30 days"], [365, "1 year"], [null, "Permanent"]] as const).map(([n, l]) => <button key={l} type="button" onClick={() => setDays(n)} className={cn("rounded-full border-2 border-foreground px-3 py-1 text-sm font-bold", days === n ? "bg-flag-red text-primary-foreground" : "bg-card")}>{l}</button>)}</div>
    <label className="mt-4 block"><span className="mb-1 block text-sm font-bold">Reason</span><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kept on record, and shown to them when they try to sign in" className="min-h-20 rounded-lg border-2 border-foreground bg-background" maxLength={300} /></label>
    <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={hide} onCheckedChange={(v) => setHide(v === true)} />Also take down their stories and chitchats</label>
    {canDevices && <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={ips} onCheckedChange={(v) => setIps(v === true)} />Also block every connection they signed in from</label>}
    <label className="mt-4 block text-sm">Type <b>{handle}</b> to confirm<Input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={cn(field, "mt-1")} /></label>
  </Modal>;
}

function UnbanModal({ open, handle, onClose, onSubmit }: { open: boolean; handle: string; onClose: () => void; onSubmit: (b: { restoreContent: boolean; liftIps: boolean }) => void }) {
  const [restore, setRestore] = useState(true);
  const [ips, setIps] = useState(true);
  return <Modal open={open} onClose={onClose} size="sm" title={`Lift the ban on ${handle}`} subtitle="They can sign in again straight away and get a notification."
    footer={<><Button onClick={() => onSubmit({ restoreContent: restore, liftIps: ips })}><Undo2 />Lift the ban</Button><Button variant="ghost" onClick={onClose}>Cancel</Button></>}>
    <label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={restore} onCheckedChange={(v) => setRestore(v === true)} />Put their hidden stories back up</label>
    <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={ips} onCheckedChange={(v) => setIps(v === true)} />Unblock the connections blocked with this ban</label>
  </Modal>;
}

function IpBanButton({ refId, member, onDone }: { refId: string; member: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await adminApi("/ip-bans", { method: "POST", body: { ref: refId, reason: reason.trim(), days: null, member } }); toast.success("Connection blocked."); setOpen(false); onDone(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Globe />Block</Button>
    <Modal open={open} onClose={() => setOpen(false)} size="sm" tone="danger" title="Block this connection" subtitle="Nobody on it can use Ghosted, signed in or not, until it's unblocked."
      footer={<><Button variant="destructive" disabled={busy || reason.trim().length < 3} onClick={() => void go()}>{busy ? <Loader2 className="animate-spin" /> : <Globe />}Block connection</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></>}>
      <label className="block"><span className="mb-1 block text-sm font-bold">Reason (kept on record)</span><Input value={reason} onChange={(e) => setReason(e.target.value)} className={field} maxLength={300} autoFocus /></label>
    </Modal>
  </>;
}

// ---------- emailing a member, in three steps: pick, write, check and send ----------
type Template = { id: string; label: string; description: string };
const STEPS = ["Choose an email", "Write it", "Check and send"] as const;

function MailWizard({ open, member, onClose }: { open: boolean; member: Detail; onClose: () => void }) {
  const templates = useQuery({ queryKey: ["admin", "mail-templates"], queryFn: () => adminApi<{ items: Template[] }>("/mail/templates"), staleTime: Infinity, enabled: open });
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState("warning");
  const [note, setNote] = useState("");
  const [subject, setSubject] = useState("");
  const [tone, setTone] = useState<"sassy" | "calm">(member.tone);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  useEffect(() => { if (open) { setStep(0); setNote(""); setSubject(""); setTone(member.tone); } }, [open, member.tone]);
  useEffect(() => {
    if (!open || step !== (template === "custom" ? 2 : 1)) return;
    setPreview(null);
    adminApi<{ subject: string; html: string }>("/mail/preview", { method: "POST", body: { template, member: member.publicId, tone, note, ...(subject.trim() && { subject }) } }).then(setPreview).catch(fail);
  }, [open, step, template, tone, note, subject, member.publicId]);
  const custom = template === "custom";
  // Ready-made emails skip straight to the check; only a custom one needs writing.
  const steps = custom ? STEPS : [STEPS[0], STEPS[2]];
  const view = custom ? step : step === 1 ? 2 : 0;
  const last = steps.length - 1;
  const send = async () => {
    setBusy(true);
    try { const r = await adminApi<{ message: string }>("/mail/send", { method: "POST", body: { template, member: member.publicId, tone, ...(note.trim() && { note }), ...(subject.trim() && { subject }) } }); toast.success(r.message); onClose(); }
    catch (e) { fail(e); } finally { setBusy(false); }
  };
  const canNext = view === 0 ? !!template : view === 1 ? note.trim().length > 0 && subject.trim().length > 0 : true;

  return <Modal open={open} onClose={onClose} size="lg" title={`Email ${member.handle}`} subtitle="Goes to the address on their account, in their theme."
    footer={<>
      {step > 0 && <Button variant="outline" onClick={() => setStep((s) => s - 1)}><ArrowLeft />Back</Button>}
      <span className="ml-auto" />
      {step < last ? <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>Next<ArrowRight /></Button>
        : <Button disabled={busy || !preview} onClick={() => void send()}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Send email</Button>}
    </>}>
    {/* Where you are */}
    <ol className="mb-5 flex items-center gap-2">{steps.map((s, i) => <li key={s} className={cn("flex min-w-0 items-center gap-2", i < last && "flex-1")}>
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border-2 border-foreground text-xs font-bold", i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-accent" : "bg-card text-muted-foreground")}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>
      <span className={cn("hidden truncate text-sm font-bold sm:block", i !== step && "text-muted-foreground")}>{s}</span>
      {i < last && <span className={cn("h-0.5 flex-1 rounded-full", i < step ? "bg-primary" : "bg-foreground/15")} />}
    </li>)}</ol>

    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={view} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.16 }}>
        {view === 0 && (templates.isPending ? <Skeleton rows={3} h="h-16" /> : <div className="grid gap-2 sm:grid-cols-2">{(templates.data?.items ?? []).map((t) => <button key={t.id} type="button" onClick={() => setTemplate(t.id)} className={cn("rounded-xl border-2 p-3 text-left transition-colors", template === t.id ? "border-foreground bg-primary text-primary-foreground shadow-hard-sm" : "border-foreground/15 bg-card hover:border-foreground")}>
          <span className="block font-bold">{t.label}</span><span className={cn("block text-xs", template === t.id ? "opacity-85" : "text-muted-foreground")}>{t.description}</span>
        </button>)}</div>)}
        {view === 1 && <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Write the subject and the message. It goes out in the Ghosted email frame, greeting them by handle, with a button back to Ghosted. Blank lines start new paragraphs.</p>
          <label className="block"><span className="mb-1 block text-sm font-bold">Subject</span><Input value={subject} onChange={(e) => setSubject(e.target.value)} className={field} maxLength={120} autoFocus /></label>
          <label className="block"><span className="mb-1 block text-sm font-bold">Message</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-48 rounded-lg border-2 border-foreground bg-background" maxLength={3000} /><span className="mt-1 block text-right text-xs text-muted-foreground">{note.length}/3000</span></label>
        </div>}
        {view === 2 && <div>
          {!custom && <div className="mb-3 flex flex-wrap items-center gap-3"><span className="text-sm font-bold">Voice</span><Segmented label="Voice" value={tone} onChange={setTone} options={[{ id: "sassy", label: "Sassy" }, { id: "calm", label: "Calm" }]} /><span className="text-xs text-muted-foreground">Their setting is {member.tone}.</span></div>}
          <dl className="mb-3 grid gap-1 text-sm"><div className="flex gap-2"><dt className="w-16 text-muted-foreground">To</dt><dd className="font-semibold">{member.handle}{member.private?.email ? ` (${member.private.email})` : ""}</dd></div><div className="flex gap-2"><dt className="w-16 text-muted-foreground">Subject</dt><dd className="font-semibold">{preview?.subject ?? "…"}</dd></div></dl>
          <div className="overflow-hidden rounded-xl border-2 border-foreground bg-white">{preview ? <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[26rem] w-full" /> : <div className="skeleton h-[26rem]" />}</div>
        </div>}
      </motion.div>
    </AnimatePresence>
  </Modal>;
}

type IpBan = { ref: string; ip: string | null; reason: string | null; member: string | null; by: string; until: string | null; at: string };
function IpBans() {
  const { ask, confirmation } = useConfirm();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "ip-bans"], queryFn: () => adminApi<{ items: IpBan[] }>("/ip-bans") });
  const lift = async (b: IpBan) => { try { await adminApi(`/ip-bans/${b.ref}`, { method: "DELETE" }); toast.success("Connection unblocked."); void qc.invalidateQueries({ queryKey: ["admin", "ip-bans"] }); } catch (e) { fail(e); } };
  return <>
    <p className="mb-4 max-w-2xl text-sm text-muted-foreground">Blocked connections can't use Ghosted at all, signed in or not. Only a keyed hash of the address is stored; the masked form is shown so you can tell them apart. Block from a member's devices list.</p>
    {q.isPending ? <RuledListSkeleton rows={3} /> : !q.data?.items.length ? <Empty icon={ShieldOff} title="No blocked connections" copy="Open a member and block one of their devices, or tick it when banning." />
      : <ul className={cn(card, "divide-y-2 divide-foreground/10")}>{q.data.items.map((b) => <li key={b.ref} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
        <Globe className="size-4 shrink-0" />
        <div className="min-w-0 flex-1"><p className="font-mono text-sm font-bold">{b.ip ?? "Unknown address"}</p><p className="text-xs text-muted-foreground">{b.reason ?? "No reason"}. By {b.by}, {ago(b.at)}{b.until ? `, until ${fmt(b.until)}` : ""}{b.member ? `, from member ${b.member}` : ""}</p></div>
          <Button size="sm" variant="outline" onClick={() => void ask({ title: "Unblock this connection?", copy: "Requests from this connection will be allowed again immediately.", confirm: "Unblock connection" }).then((ok) => ok && lift(b))}><Undo2 />Unblock</Button>
      </li>)}</ul>}
    {confirmation}</>;
}
