// Waiting Room: your private tracker of applications you're waiting on. Each one has a clock that
// counts the days since you last heard anything, measured against how long people usually wait at
// that company and round (from real stories). When the silence has gone on long enough, it offers
// to turn the application into a story, pre-filled, so the next candidate knows.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  BellRing, Check, CheckCircle2, ChevronDown, Clock, Ghost, Hourglass, Lock, MailCheck, MoreHorizontal, Pencil, Plus, RotateCcw, Send, Sparkles, StickyNote, Trash2, TrendingUp,
} from "lucide-react";
import { apiEnabled, ApiRequestError } from "@/lib/api";
import {
  daysSince, isoDay, NEXT_STAGE, OUTCOME_WORD, STAGE_LABEL, useApplications, verdict,
  type Application, type NewApplication, type Outcome, type Stage, type Verdict,
} from "@/lib/applications";
import { logoSrc, useCompanyIndex } from "@/lib/stories";
import { CompanyMark } from "@/components/ghosted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { card, popup, popupBody } from "./ui-kit";
import { ShareModal, type StoryPreset } from "./share-story";
import { CompanyPicker } from "@/components/company-picker";
import { DateField } from "@/components/date-field";

const TONE: Record<Verdict, { label: string; pill: string; bar: string; icon: typeof Clock }> = {
  fresh: { label: "Just applied", pill: "bg-muted text-foreground", bar: "var(--chart-cyan)", icon: Sparkles },
  on_track: { label: "On track", pill: "bg-flag-green/15 text-flag-green", bar: "var(--flag-green)", icon: CheckCircle2 },
  late: { label: "Running late", pill: "bg-flag-amber/25 text-foreground", bar: "var(--flag-amber)", icon: Hourglass },
  ghosted: { label: "Probably ghosted", pill: "bg-flag-red/15 text-flag-red", bar: "var(--flag-red)", icon: Ghost },
};
const SEVERITY: Record<Verdict, number> = { ghosted: 0, late: 1, on_track: 2, fresh: 3 };
const STORY_OUTCOMES = new Set(["ghosted", "rejected", "offer", "offer_revoked", "ghost_job"]);
const fmt = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : /[^aeiou]y$/.test(w) ?`${w.slice(0, -1)}ies` : `${w}s`}`;

// Re-renders once a minute so the day counters roll over at midnight without a reload.
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  return now;
}

function SectionHead({ action }: { action?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0"><p className="text-xs font-bold uppercase text-primary">Your private tracker</p><h2 className="text-2xl font-bold">Waiting Room</h2>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Lock className="size-3.5" />Only you can see this. Nothing here is ever public or counted in any statistic.</p></div>
    {action}
  </div>;
}

// ---------- add / edit ----------

type Form = { company: string; other: string; role: string; stage: Stage; applied: string; since: string; note: string };
const blank = (): Form => ({ company: "", other: "", role: "", stage: "application", applied: isoDay(), since: isoDay(), note: "" });
const OTHER = "__other";

function ApplicationDialog({ open, onOpenChange, editing, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Application | null; onSave: (f: Form) => Promise<void> }) {
  const { list } = useCompanyIndex();
  const [f, setF] = useState<Form>(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setF(editing ? { company: editing.company.slug ?? OTHER, other: editing.company.slug ? "" : editing.company.name, role: editing.role ?? "", stage: editing.stage, applied: editing.appliedOn, since: editing.waitingSince, note: editing.note ?? "" } : blank());
  }, [open, editing]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  const today = isoDay();
  const earliest = isoDay(new Date(Date.now() - 730 * 86400_000));
  const problem = !f.company ? "Pick a company" : f.company === OTHER && f.other.trim().length < 1 ? "Type the company's name" : !f.applied ? "When did you apply?" : f.since < f.applied ? "The last reply can't be before you applied" : f.since > today || f.applied > today ? "Dates can't be in the future" : null;
  const save = async () => {
    if (problem) { setErr(problem); return; }
    setBusy(true);
    try { await onSave(f); onOpenChange(false); }
    catch (e) { setErr(e instanceof ApiRequestError ? (e.fields ? Object.values(e.fields)[0] ?? e.message : e.message) : "Couldn't save. Try again."); }
    finally { setBusy(false); }
  };
  const label = "mb-1.5 block text-sm font-bold";
  // Same height, border and fill as the dropdowns and date fields next to it.
  const field = "h-11 rounded-lg border-2 border-foreground bg-background";
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={popup}><div className={popupBody} data-lenis-prevent>
      <DialogHeader className="text-left">
        <span className="mb-2 grid size-12 place-items-center rounded-xl border-2 border-foreground bg-accent"><Hourglass className="size-5" /></span>
        <DialogTitle className="font-display text-2xl">{editing ? "Edit application" : "Track an application"}</DialogTitle>
        <DialogDescription>Start the clock. We'll tell you when the silence is longer than usual.</DialogDescription>
      </DialogHeader>
      <div className="mt-5 space-y-4">
        <div>
          <span className={label}>Company</span>
          <CompanyPicker value={f.company} onChange={(v) => set("company", v)} companies={list} disabled={!!editing} extra={[{ value: OTHER, label: "Not listed on Ghosted" }]} />
          {f.company === OTHER && <Input value={f.other} onChange={(e) => set("other", e.target.value.slice(0, 80))} placeholder="Company name" className={cn(field, "mt-2")} disabled={!!editing} />}
          {f.company === OTHER && <p className="mt-1 text-xs text-muted-foreground">Without a listing there's no usual wait to compare with, so we use the platform's.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className={label}>Role <span className="font-normal text-muted-foreground">(optional)</span></span><Input value={f.role} onChange={(e) => set("role", e.target.value.slice(0, 80))} placeholder="Backend Engineer" className={field} /></label>
          <div><span className={label}>Where are you?</span>
            <Select value={f.stage} onValueChange={(v) => set("stage", v as Stage)}>
              <SelectTrigger aria-label="Where are you?"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(STAGE_LABEL) as Stage[]).map((s) => <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><span className={label}>Applied on</span><DateField label="Applied on" value={f.applied} min={earliest} max={today} onChange={(v) => setF((s) => ({ ...s, applied: v, since: s.since < v ? v : s.since }))} /></div>
          <div><span className={label}>Last heard from them</span><DateField label="Last heard from them" value={f.since} min={f.applied || earliest} max={today} onChange={(v) => set("since", v)} /></div>
        </div>
        <label className="block"><span className={label}>Private note <span className="font-normal text-muted-foreground">(optional, encrypted)</span></span>
          <Textarea value={f.note} onChange={(e) => set("note", e.target.value.slice(0, 1000))} rows={3} placeholder={'Recruiter said "by Friday". Referral from Priya.'} className="rounded-lg border-2 border-foreground bg-background" />
        </label>
        <AnimatePresence>{err && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm font-semibold text-flag-red">{err}</motion.p>}</AnimatePresence>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={busy}>{editing ? <><Check />Save changes</> : <><Plus />Start tracking</>}</Button>
        </div>
      </div>
    </div></DialogContent>
  </Dialog>;
}

// ---------- one application ----------

function Meter({ days, usual, tone }: { days: number; usual: number; tone: string }) {
  const scale = Math.max(usual * 2, days, 1);
  return <div className="relative mt-3 h-3 rounded-full bg-muted" aria-hidden="true">
    <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: tone }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (days / scale) * 100)}%` }} transition={{ type: "spring", stiffness: 110, damping: 20 }} />
    <div className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card shadow-sm" style={{ left: `${(usual / scale) * 100}%` }} title="The usual wait" />
  </div>;
}

function usualLine(a: Application) {
  if (!a.usual) return "Not enough stories yet to know the usual wait.";
  const where = a.usual.basis === "company_stage" ? `at ${a.company.name} after this round` : a.usual.basis === "company" ? `at ${a.company.name}` : "across Ghosted after this round";
  return `Usually ${plural(a.usual.days, "day")} ${where} (${plural(a.usual.stories, "story")})`;
}

function WaitingCard({ a, now, onAction }: { a: Application; now: Date; onAction: (kind: "edit" | "story" | "delete" | "followup" | { advance: Stage } | { close: Outcome }, a: Application) => void }) {
  const days = daysSince(a.waitingSince, now);
  const v = verdict(a, now);
  const t = TONE[v];
  const usual = a.usual?.days ?? 14;
  const over = days - usual;
  const next = NEXT_STAGE[a.stage];
  const followedAgo = a.lastFollowup ? daysSince(a.lastFollowup, now) : null;
  const nudge = v === "late" && (followedAgo == null || followedAgo >= 7);
  const [noteOpen, setNoteOpen] = useState(false);
  return <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.2 }} className={cn(card, "overflow-hidden")}>
    <div className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <CompanyMark size="sm" company={{ name: a.company.name, initial: a.company.name[0] ?? "?", color: a.company.color ?? "bg-muted", logoUrl: a.company.slug ? logoSrc(a.company.slug, a.company.logoUrl) : a.company.logoUrl }} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{a.company.name}</p>
          <p className="truncate text-sm text-muted-foreground">{[a.role, STAGE_LABEL[a.stage]].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-3xl font-bold leading-none tabular-nums sm:text-4xl">{days}<span className="ml-0.5 text-base">d</span></p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">since last reply</p>
        </div>
      </div>

      <Meter days={days} usual={usual} tone={t.bar} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{usualLine(a)}</span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold", t.pill)}><t.icon className="size-3.5" />{t.label}{over > 0 && ` · +${over}d`}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />Applied {fmt(a.appliedOn)}</span>
        {a.followups > 0 && <span className="inline-flex items-center gap-1"><Send className="size-3.5" />Followed up {plural(a.followups, "time")}{followedAgo != null && `, last ${followedAgo === 0 ? "today" : `${followedAgo}d ago`}`}</span>}
        {a.note && <button type="button" onClick={() => setNoteOpen((o) => !o)} className="inline-flex items-center gap-1 font-semibold text-foreground"><StickyNote className="size-3.5" />Note<ChevronDown className={cn("size-3.5 transition-transform", noteOpen && "rotate-180")} /></button>}
      </div>
      <AnimatePresence initial={false}>{noteOpen && a.note && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden whitespace-pre-wrap text-sm"><span className="mt-2 block rounded-lg bg-muted p-3">{a.note}</span></motion.p>}</AnimatePresence>
    </div>

    {/* The moment that matters: long enough that most people would call it. */}
    {v === "ghosted" && <div className="border-t-2 border-foreground bg-flag-red/10 px-4 py-3 sm:px-5">
      <p className="text-sm"><span className="font-bold">Day {days}.</span> That's {usual > 0 ? `${Math.round((days / usual) * 10) / 10}× the usual wait` : "a long wait"}. Most people would call it by now. Share what happened, so the next candidate knows what to expect.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onAction("story", a)}><Ghost />Share what happened</Button>
        <Button size="sm" variant="outline" onClick={() => onAction({ close: "ghosted" }, a)}>Close it as ghosted</Button>
      </div>
    </div>}
    {nudge && <div className="border-t-2 border-foreground bg-flag-amber/20 px-4 py-2.5 text-sm sm:px-5"><BellRing className="mr-1.5 inline size-4" />You're past the usual wait. A short, polite follow-up is completely fair now.</div>}

    <div className="flex flex-wrap items-center gap-2 border-t-2 border-foreground/10 bg-muted/40 px-3 py-2.5 sm:px-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm"><MailCheck />Heard back<ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {next && <DropdownMenuItem onSelect={() => onAction({ advance: next }, a)}><TrendingUp className="size-4" />Moved to {STAGE_LABEL[next].toLowerCase()}</DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => onAction({ advance: a.stage }, a)}><RotateCcw className="size-4" />Got an update, still waiting</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">It's over</DropdownMenuLabel>
          {(["offer", "rejected", "offer_revoked", "ghost_job", "withdrew"] as Outcome[]).map((o) => <DropdownMenuItem key={o} onSelect={() => onAction({ close: o }, a)}>{OUTCOME_WORD[o]}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="outline" onClick={() => onAction("followup", a)} disabled={followedAgo === 0}><Send />{followedAgo === 0 ? "Followed up today" : "I followed up"}</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" aria-label="More options" className="ml-auto grid size-8 place-items-center rounded-lg border-2 border-transparent hover:border-foreground hover:bg-card"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onAction("edit", a)}><Pencil className="size-4" />Edit</DropdownMenuItem>
          {a.company.slug && <DropdownMenuItem onSelect={() => onAction("story", a)}><Ghost className="size-4" />Turn into a story</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onAction("delete", a)} className="text-flag-red focus:text-flag-red"><Trash2 className="size-4" />Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </motion.li>;
}

function ClosedRow({ a, onAction }: { a: Application; onAction: (kind: "story" | "delete" | "reopen", a: Application) => void }) {
  const total = a.closedAt ? daysSince(a.appliedOn, new Date(a.closedAt)) : null;
  const good = a.outcome === "offer";
  return <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3 py-3">
    <CompanyMark size="sm" company={{ name: a.company.name, initial: a.company.name[0] ?? "?", color: a.company.color ?? "bg-muted", logoUrl: a.company.slug ? logoSrc(a.company.slug, a.company.logoUrl) : a.company.logoUrl }} />
    <div className="min-w-0 flex-1">
      <p className="truncate font-semibold">{a.company.name}{a.role && <span className="font-normal text-muted-foreground"> · {a.role}</span>}</p>
      <p className="text-xs text-muted-foreground">{a.outcome && <span className={cn("font-bold", good ? "text-flag-green" : a.outcome === "withdrew" ? "" : "text-flag-red")}>{OUTCOME_WORD[a.outcome]}</span>}{total != null && ` · ${plural(total, "day")} start to finish`}</p>
    </div>
    {a.storyPublicId ? <span className="hidden shrink-0 items-center gap-1 text-xs font-bold text-flag-green sm:inline-flex"><Check className="size-3.5" />Shared</span>
      : a.company.slug && a.outcome && STORY_OUTCOMES.has(a.outcome) && <Button size="sm" variant="outline" className="shrink-0" onClick={() => onAction("story", a)}><Ghost /><span className="hidden sm:inline">Share story</span></Button>}
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" aria-label="More options" className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-muted"><MoreHorizontal className="size-4" /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onAction("reopen", a)}><RotateCcw className="size-4" />Still waiting after all</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAction("delete", a)} className="text-flag-red focus:text-flag-red"><Trash2 className="size-4" />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </motion.li>;
}

// Placeholders shaped like the real tiles and cards, with the same light wave as the feed (.skeleton).
function LoadingCards() {
  return <div className="space-y-5" role="status" aria-label="Loading your Waiting Room">
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className={cn(card, "space-y-2 p-4")}><div className="skeleton h-3 w-20" /><div className="skeleton h-7 w-12" /><div className="skeleton h-2.5 w-24" /></div>)}</div>
    <div className="skeleton h-4 w-32" />
    <div className="grid gap-4 xl:grid-cols-2">{[0, 1].map((i) => <div key={i} className={cn(card, "overflow-hidden")}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3"><div className="skeleton size-9 rounded-lg" /><div className="flex-1 space-y-2"><div className="skeleton h-4 w-36" /><div className="skeleton h-3 w-48" /></div><div className="space-y-1.5"><div className="skeleton ml-auto h-8 w-12" /><div className="skeleton h-2.5 w-16" /></div></div>
        <div className="skeleton mt-4 h-3 w-full rounded-full" />
        <div className="mt-3 flex justify-between"><div className="skeleton h-3 w-56" /><div className="skeleton h-5 w-20 rounded-full" /></div>
        <div className="skeleton mt-3 h-3 w-28" />
      </div>
      <div className="flex gap-2 border-t-2 border-foreground/10 bg-muted/40 px-4 py-2.5"><div className="skeleton h-8 w-28 rounded-lg" /><div className="skeleton h-8 w-28 rounded-lg" /></div>
    </div>)}</div>
  </div>;
}

// ---------- the view ----------

export function WaitingRoomView() {
  const { list, loading, error, add, update, remove } = useApplications();
  const now = useNow();
  const [dialog, setDialog] = useState<{ open: boolean; editing: Application | null }>({ open: false, editing: null });
  const [story, setStory] = useState<{ app: Application; preset: StoryPreset } | null>(null);

  const waiting = useMemo(() => list.filter((a) => a.status === "waiting").sort((x, y) => SEVERITY[verdict(x, now)] - SEVERITY[verdict(y, now)] || daysSince(y.waitingSince, now) - daysSince(x.waitingSince, now)), [list, now]);
  const closed = useMemo(() => list.filter((a) => a.status === "closed").sort((x, y) => (y.closedAt ?? "").localeCompare(x.closedAt ?? "")), [list]);
  const longest = waiting.reduce<Application | null>((m, a) => (!m || daysSince(a.waitingSince, now) > daysSince(m.waitingSince, now) ? a : m), null);
  const ghostedNow = waiting.filter((a) => verdict(a, now) === "ghosted").length;
  const answered = closed.filter((a) => a.outcome && a.outcome !== "ghosted" && a.outcome !== "ghost_job" && a.outcome !== "withdrew").length;
  const decided = closed.filter((a) => a.outcome && a.outcome !== "withdrew").length;

  const run = async (work: Promise<void>, ok: string) => { try { await work; toast.success(ok); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save. Try again."); } };
  const act = (kind: "edit" | "story" | "delete" | "followup" | "reopen" | { advance: Stage } | { close: Outcome }, a: Application) => {
    if (kind === "edit") return setDialog({ open: true, editing: a });
    if (kind === "delete") return void run(remove(a), `${a.company.name} removed.`);
    if (kind === "followup") return void run(update(a, { followedUp: true }), "Follow-up noted. The clock keeps running until they reply.");
    if (kind === "reopen") return void run(update(a, { reopen: true }), "Back in the waiting list.");
    if (kind === "story") {
      if (!a.company.slug) return;
      const outcome = a.status === "closed" && a.outcome && STORY_OUTCOMES.has(a.outcome) ? a.outcome : "ghosted";
      return setStory({ app: a, preset: { company: a.company.slug, stage: a.stage === "application" ? "application" : a.stage, role: a.role ?? "", outcome, days: daysSince(a.waitingSince, now) } });
    }
    if ("advance" in kind) return void run(update(a, { advance: kind.advance }), kind.advance === a.stage ? "Clock restarted from today." : `Nice. On to ${STAGE_LABEL[kind.advance].toLowerCase()}, clock restarted.`);
    return void run(update(a, { close: kind.close }), kind.close === "offer" ? "Congratulations! Closed with an offer." : "Closed. Sharing how it went helps the next person.");
  };
  const save = async (f: Form) => {
    const role = f.role.trim() || null, note = f.note.trim() || null;
    if (dialog.editing) await update(dialog.editing, { role, stage: f.stage, appliedOn: f.applied, waitingSince: f.since, note });
    else {
      const n: NewApplication = { ...(f.company === OTHER ? { companyName: f.other.trim() } : { companySlug: f.company }), role, stage: f.stage, appliedOn: f.applied, waitingSince: f.since, note };
      await add(n);
    }
    toast.success(dialog.editing ? "Saved." : "Clock started. We'll keep count.");
  };

  const addButton = <Button onClick={() => setDialog({ open: true, editing: null })}><Plus />Track an application</Button>;
  const tiles = [
    { label: "Waiting on", value: String(waiting.length), note: waiting.length === 1 ? "company" : "companies" },
    { label: "Longest silence", value: longest ? `${daysSince(longest.waitingSince, now)}d` : "–", note: longest ? longest.company.name : "nothing yet" },
    { label: "Probably ghosted", value: String(ghostedNow), note: "past twice the usual wait" },
    { label: "Got an answer", value: decided ? `${Math.round((answered / decided) * 100)}%` : "–", note: decided ? `of ${plural(decided, "finished application")}` : "once some finish" },
  ];

  return <div className="space-y-5">
    <SectionHead action={addButton} />
    {!apiEnabled && <p className="inline-flex rounded-full border-2 border-foreground bg-accent px-3 py-1 text-xs font-bold">Preview: kept in this browser</p>}

    {loading ? <LoadingCards />
      : error ? <p className={cn(card, "p-6 text-sm")}>Couldn't load your Waiting Room. Check your connection and try again.</p>
      : !list.length ? <div className={cn(card, "p-8 text-center sm:p-10")}>
          <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl border-2 border-foreground bg-accent"><Hourglass className="size-6" /></span>
          <p className="font-display text-2xl font-bold">Nothing on the clock yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Add the applications you're waiting on. Each gets a timer, compared with how long people usually wait at that company, so you know when it's fine to follow up and when it's time to move on.</p>
          <div className="mt-5">{addButton}</div>
        </div>
      : <>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">{tiles.map((t) => <div key={t.label} className={cn(card, "p-4")}>
          <p className="text-xs font-semibold text-muted-foreground">{t.label}</p>
          <p className="mt-1 truncate font-display text-2xl font-bold sm:text-3xl">{t.value}</p>
          <p className="truncate text-xs text-muted-foreground">{t.note}</p>
        </div>)}</div>

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-bold"><Hourglass className="size-4 text-primary" />Still waiting <span className="text-sm font-normal text-muted-foreground">({waiting.length})</span></h3>
          {waiting.length ? <ul className="grid gap-4 xl:grid-cols-2"><AnimatePresence initial={false}>{waiting.map((a) => <WaitingCard key={a.publicId} a={a} now={now} onAction={act} />)}</AnimatePresence></ul>
            : <p className={cn(card, "p-5 text-sm text-muted-foreground")}>Nothing on the clock. Enjoy the quiet, or add the next one.</p>}
        </section>

        {closed.length > 0 && <section className={cn(card, "p-4 sm:p-5")}>
          <h3 className="flex items-center gap-2 font-bold"><CheckCircle2 className="size-4 text-flag-green" />Finished <span className="text-sm font-normal text-muted-foreground">({closed.length})</span></h3>
          <ul className="mt-1 divide-y-2 divide-foreground/10"><AnimatePresence initial={false}>{closed.map((a) => <ClosedRow key={a.publicId} a={a} onAction={act} />)}</AnimatePresence></ul>
        </section>}
      </>}

    <ApplicationDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} editing={dialog.editing} onSave={save} />
    <ShareModal open={!!story} onOpenChange={(o) => { if (!o) setStory(null); }} preset={story?.preset ?? null}
      onPublished={(id) => {
        const a = story?.app;
        if (!a) return;
        const close = a.status === "waiting" ? { close: (story!.preset.outcome as Outcome) ?? "ghosted" } : {};
        void update(a, { ...close, ...(id && { storyPublicId: id }) }).catch(() => undefined);
      }} />
  </div>;
}
