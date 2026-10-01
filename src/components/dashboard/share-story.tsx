// "Share a story": a four-step flow that's meant to feel good to finish.
//   1. Where    company, stage, role
//   2. What     how it ended, a title, and the story itself (Markdown, with a toolbar and preview)
//   3. Rate     five star ratings with a live Flag Score, plus optional salary and waiting time
//   4. Post     a preview exactly as it'll look in the feed, the human check, and Post
// Drafts save themselves in this browser, so closing it (or a flaky connection) loses nothing.
// The API validates everything again (backend/src/routes/stories.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft, ArrowRight, Bold, Briefcase, Building2, Check, ClipboardCheck, Code, Eye, SquareCode, FileSearch, Ghost, Heading, Italic, List, ListOrdered,
  Loader2, MessageSquareQuote, PartyPopper, PenLine, Plus, Sparkles, Star, Strikethrough, Undo2, Wand2, XCircle, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, CompanyMark, FlagScore } from "@/components/ghosted";
import { HumanCheck, useHumanCheck } from "@/components/human-check";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CompanyPicker } from "@/components/company-picker";
import { speak } from "@/lib/goofy";
import { api, ApiRequestError, apiEnabled } from "@/lib/api";
import { liveNudge } from "@/lib/live";
import { displayName, isPublic, useMe, useTone, voice } from "@/lib/session";
import { useCompanyIndex, type StoryModel } from "@/lib/stories";
import { cn } from "@/lib/utils";
import { ListCompanyDialog } from "./list-company";
import { popup, popupBody, scoreTone } from "./ui-kit";

// ---------- options ----------

const STAGES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "application", label: "Applied", icon: FileSearch },
  { id: "screening", label: "Screening call", icon: MessageSquareQuote },
  { id: "technical", label: "Technical round", icon: Briefcase },
  { id: "final", label: "Final round", icon: Building2 },
  { id: "offer", label: "Offer stage", icon: ClipboardCheck },
];

const OUTCOMES: { id: string; label: string; icon: LucideIcon; blurb: string; tone: string }[] = [
  { id: "ghosted", label: "Ghosted", icon: Ghost, blurb: "They just… stopped replying", tone: "text-flag-red" },
  { id: "rejected", label: "Rejected", icon: XCircle, blurb: "A no, at least", tone: "text-flag-amber" },
  { id: "offer", label: "Got an offer", icon: PartyPopper, blurb: "The rare happy ending", tone: "text-flag-green" },
  { id: "offer_revoked", label: "Offer revoked", icon: Undo2, blurb: "Offered, then un-offered", tone: "text-flag-red" },
  { id: "ghost_job", label: "Ghost job", icon: FileSearch, blurb: "The role never really existed", tone: "text-flag-red" },
];

const RATINGS = [
  { key: "hiring", label: "Hiring process", hint: "Clear, fair, well organised?" },
  { key: "communication", label: "Communication", hint: "Did they reply, and on time?" },
  { key: "culture", label: "Work culture", hint: "Respectful? Would you want to work there?" },
  { key: "pay", label: "Pay transparency", hint: "Was the salary discussed honestly?" },
  { key: "growth", label: "Growth", hint: "Did the role sound like it went somewhere?" },
] as const;
type RatingKey = (typeof RATINGS)[number]["key"];
const STAR_WORD = ["", "Awful", "Poor", "Okay", "Good", "Great"];
const STAR_TONE = ["", "text-flag-red", "text-flag-red", "text-flag-amber", "text-flag-green", "text-flag-green"];

const STEPS = [
  { id: "where", label: "Where" },
  { id: "what", label: "What happened" },
  { id: "rate", label: "Rate it" },
  { id: "post", label: "Post" },
] as const;

// ---------- draft ----------

type Draft = {
  company: string; stage: string; role: string; outcome: string; title: string; body: string;
  ratings: Record<RatingKey, number>; min: string; max: string; days: string;
};
const EMPTY: Draft = { company: "", stage: "", role: "", outcome: "", title: "", body: "", ratings: { hiring: 0, communication: 0, culture: 0, pay: 0, growth: 0 }, min: "", max: "", days: "" };
const DRAFT_KEY = "ghosted.storyDraft";
const loadDraft = (): Draft | null => { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null; return d && typeof d === "object" ? { ...EMPTY, ...d, ratings: { ...EMPTY.ratings, ...d.ratings } } : null; } catch { return null; } };
const saveDraft = (d: Draft) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked */ } };
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage blocked */ } };
const isBlank = (d: Draft) => JSON.stringify(d) === JSON.stringify(EMPTY);

const TEMPLATE = "### What happened\n\n\n### How long it took\n\n\n### Tip for the next candidate\n";

// ---------- markdown editor ----------

function MarkdownEditor({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  // Wraps the selection (or inserts at the caret) and puts the selection back where it makes sense.
  const wrap = (before: string, after = before, fallback = "text") => {
    const el = ref.current; if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const picked = value.slice(s, e) || fallback;
    onChange(value.slice(0, s) + before + picked + after + value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + picked.length); });
  };
  // Adds a prefix to every selected line (lists, quotes, headings).
  const lines = (prefix: (i: number) => string) => {
    const el = ref.current; if (!el) return;
    const s = value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const e = el.selectionEnd;
    const block = value.slice(s, e) || "";
    const next = (block || "").split("\n").map((l, i) => prefix(i) + l.replace(/^(#{1,6}\s|>\s|[-*]\s|\d+\.\s)/, "")).join("\n");
    onChange(value.slice(0, s) + next + value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + next.length, s + next.length); });
  };
  const tools: { icon: LucideIcon; label: string; run: () => void }[] = [
    { icon: Bold, label: "Bold", run: () => wrap("**") },
    { icon: Italic, label: "Italic", run: () => wrap("_") },
    { icon: Strikethrough, label: "Strikethrough", run: () => wrap("~~") },
    { icon: Heading, label: "Heading", run: () => lines(() => "### ") },
    { icon: List, label: "Bullet list", run: () => lines(() => "- ") },
    { icon: ListOrdered, label: "Numbered list", run: () => lines((i) => `${i + 1}. `) },
    { icon: MessageSquareQuote, label: "Quote", run: () => lines(() => "> ") },
    { icon: Code, label: "Inline code", run: () => wrap("`", "`", "code") },
    { icon: SquareCode, label: "Code block", run: () => wrap("\n```\n", "\n```\n", "your code here") },
  ];
  const onKey = (e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === "b") { e.preventDefault(); wrap("**"); }
    if (e.key === "i") { e.preventDefault(); wrap("_"); }
  };
  return <div className="overflow-hidden rounded-lg border-2 border-foreground bg-background focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-card">
    <div className="flex flex-wrap items-center gap-1 border-b-2 border-foreground bg-muted/60 px-1.5 py-1">
      {/* One pill slides between the two equal-width tabs. It only moves sideways inside this box
          (x: 0 ↔ 100% of its own width), so the popup re-centring when the height changes can't
          make it jump. Same spring as the log-in / sign-up switch. */}
      <div className="relative mr-1 grid grid-cols-2 rounded-full border-2 border-foreground bg-card p-0.5 text-xs font-bold">
        <motion.span aria-hidden="true" className="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-primary" initial={false} animate={{ x: tab === "write" ? "0%" : "100%" }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />
        {(["write", "preview"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className={cn("relative z-10 inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 capitalize transition-colors duration-200", tab === t ? "text-primary-foreground" : "text-foreground hover:text-primary")}>
          {t === "write" ? <PenLine className="size-3.5" /> : <Eye className="size-3.5" />}{t}
        </button>)}
      </div>
      {tab === "write" && tools.map(({ icon: Icon, label, run }) => <button key={label} type="button" onClick={run} title={label} aria-label={label} className="grid size-8 place-items-center rounded-full border-2 border-transparent text-foreground transition-colors hover:border-foreground hover:bg-card"><Icon className="size-4" /></button>)}
    </div>
    {tab === "write"
      ? <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} maxLength={4000} rows={9} placeholder={placeholder} className="block min-h-48 w-full resize-y bg-transparent px-3 py-2.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground" />
      : <div className="min-h-48 px-3 py-2.5 text-[15px]">{value.trim() ? <Markdown text={value} /> : <p className="text-muted-foreground">Nothing to preview yet.</p>}</div>}
  </div>;
}

// ---------- bits ----------

function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return <DialogHeader className="pr-8 text-left">
    <p className="text-xs font-bold uppercase tracking-wide text-primary">Step {step + 1} of {STEPS.length}</p>
    <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
    <DialogDescription>{subtitle}</DialogDescription>
  </DialogHeader>;
}

function Progress({ step, reached, onJump }: { step: number; reached: number; onJump: (i: number) => void }) {
  return <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Progress">{STEPS.map((s, i) => <li key={s.id}>
    <button type="button" disabled={i > reached} onClick={() => onJump(i)} className="group w-full text-left disabled:cursor-not-allowed" aria-current={i === step ? "step" : undefined}>
      <span className="block h-2 overflow-hidden rounded-full border-2 border-foreground bg-card">
        <motion.span className="block h-full bg-primary" initial={false} animate={{ width: i < step ? "100%" : i === step ? "55%" : "0%" }} transition={{ type: "spring", stiffness: 200, damping: 26 }} />
      </span>
      <span className={cn("mt-1 hidden items-center gap-1 text-[11px] font-bold sm:flex", i === step ? "text-foreground" : i < step ? "text-primary" : "text-muted-foreground")}>{i < step && <Check className="size-3" />}{s.label}</span>
    </button>
  </li>)}</ol>;
}

function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3"><span className="text-sm font-bold">{children}</span>{hint && <span className="text-xs text-muted-foreground">{hint}</span>}</div>;
}

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return <div className="flex items-center gap-2" onMouseLeave={() => setHover(0)}>
    <div className="flex" role="radiogroup" aria-label={label}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5: ${STAR_WORD[n]}`} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => onChange(n)} className="p-0.5 sm:p-1">
      <motion.span className="block" animate={{ scale: n <= shown ? 1.12 : 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
        <Star className={cn("size-6 transition-colors sm:size-7", n <= shown ? "fill-flag-amber text-foreground" : "text-muted-foreground")} strokeWidth={n <= shown ? 1.5 : 2} />
      </motion.span>
    </button>)}</div>
    <span className={cn("w-12 text-xs font-bold", STAR_TONE[shown])}>{STAR_WORD[shown]}</span>
  </div>;
}

// ---------- the flow ----------

// A story being edited → the draft it starts from (the company can't change).
const draftFrom = (s: StoryModel): Draft => ({
  company: s.company.id, stage: s.stage ?? "", role: s.role ?? "", outcome: s.outcome, title: s.title ?? "", body: s.body,
  ratings: s.ratings ?? EMPTY.ratings,
  min: s.salary ? String(s.salary[0]) : "", max: s.salary ? String(s.salary[1]) : "", days: s.daysWaited != null ? String(s.daysWaited) : "",
});

// `editing`: open the same flow pre-filled to edit one of your stories (saves with PATCH, no draft).
// `presetCompany`: opened from a company's page, so that company is picked already.
// `preset`: opened from the Waiting Room, so the company, round, role, outcome and wait are filled
// in (a fresh draft, not your saved one). `onPublished` hears back with the new story's id.
export type StoryPreset = { company?: string; stage?: string; role?: string; outcome?: string; days?: number };
export function ShareModal({ open, onOpenChange, editing = null, presetCompany = null, preset = null, onPublished }: { open: boolean; onOpenChange: (v: boolean) => void; editing?: StoryModel | null; presetCompany?: string | null; preset?: StoryPreset | null; onPublished?: (storyPublicId: string | null) => void }) {
  const qc = useQueryClient();
  const tone = useTone();
  const { me } = useMe();
  const { list: companyList, index } = useCompanyIndex();
  const shield = useHumanCheck();
  const [d, setD] = useState<Draft>(EMPTY);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [dir, setDir] = useState(1);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [listing, setListing] = useState(false);
  const [restored, setRestored] = useState(false);

  // Bring back an unfinished draft when the flow opens.
  useEffect(() => {
    if (!open) return;
    if (editing) { setD(draftFrom(editing)); setRestored(false); setReached(STEPS.length - 1); }
    else if (preset) {
      setD({ ...EMPTY, company: preset.company ?? "", stage: preset.stage ?? "", role: preset.role ?? "", outcome: preset.outcome ?? "", days: preset.days != null ? String(Math.min(730, preset.days)) : "" });
      setRestored(false); setReached(0);
    } else {
      const saved = loadDraft();
      if (saved && !isBlank(saved)) { setD({ ...saved, ...(presetCompany && { company: presetCompany }) }); setRestored(true); }
      else if (presetCompany) setD({ ...EMPTY, company: presetCompany });
      setReached(0);
    }
    setStep(0); setDone(false); setTried(false);
  }, [open, editing, presetCompany, preset]);
  // A Waiting Room story never overwrites the draft you had going.
  useEffect(() => { if (open && !editing && !preset && !done && !isBlank(d)) saveDraft(d); }, [d, open, done, editing, preset]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((s) => ({ ...s, [k]: v }));
  const company = index.get(d.company);

  // What's missing on each step (shown once they try to move on).
  const problems = useMemo(() => {
    const min = d.min === "" ? null : Number(d.min), max = d.max === "" ? null : Number(d.max);
    return [
      [!d.company && "Pick the company", !d.stage && "Pick how far you got"].filter(Boolean) as string[],
      [!d.outcome && "Pick how it ended",
        d.title.trim().length < 5 && "Give it a title (at least 5 characters)",
        d.body.trim().length < 40 && `Tell the story (${Math.max(0, 40 - d.body.trim().length)} more characters)`].filter(Boolean) as string[],
      [Object.values(d.ratings).some((r) => r === 0) && "Rate all five areas so the Flag Score is fair",
        (min === null) !== (max === null) && "Add both salary numbers, or neither",
        min !== null && max !== null && max < min && "Salary max should be at least the min",
        min !== null && (min > 1000 || (max ?? 0) > 1000) && "That salary looks off (in LPA)",
        d.days !== "" && (Number(d.days) < 0 || Number(d.days) > 730) && "Days waited should be 0 to 730"].filter(Boolean) as string[],
      [],
    ];
  }, [d]);

  const go = (to: number) => {
    if (to > step && problems[step]!.length) { setTried(true); return; }
    setTried(false); setDir(to > step ? 1 : -1); setStep(to); setReached((r) => Math.max(r, to));
  };
  const flagScore = Object.values(d.ratings).every((r) => r > 0) ? Math.round((Object.values(d.ratings).reduce((a, b) => a + b, 0) - 5) * 5) : null;

  const refresh = () => {
    for (const key of [["feed"], ["my-stories"], ["person"], ["insights"], ["story"]]) void qc.invalidateQueries({ queryKey: key });
    liveNudge();
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!apiEnabled) { toast.success("Changes saved. (Preview mode: they aren't stored.)"); return close(false); }
    setBusy(true);
    try {
      const min = d.min === "" ? null : Number(d.min), max = d.max === "" ? null : Number(d.max);
      const r = await api<{ pending?: boolean; message?: string | null }>(`/v1/stories/${editing.id}`, { method: "PATCH", body: {
        outcome: d.outcome, stage: d.stage, title: d.title.trim(), body: d.body.trim(), ...(d.role.trim() && { role: d.role.trim() }),
        ratings: d.ratings, salary: min !== null && max !== null ? { min, max } : null, daysWaited: d.days === "" ? null : Number(d.days),
      } });
      // Held by the automatic review: saved, goes back up after a quick check.
      if (r.pending) speak(r.message ?? "Saved. Your story will be back up after a quick check.");
      else toast.success(voice(tone, "Story updated. The record has been set straight.", "Your changes have been saved."));
      refresh();
      close(false);
    } catch (err) {
      if (err instanceof ApiRequestError && err.message.startsWith("Goofy: ")) speak(err.message, "error");
      else toast.error(err instanceof ApiRequestError ? (err.fields ? Object.values(err.fields)[0] ?? err.message : err.message) : "Couldn't save your changes. Try again.");
    } finally { setBusy(false); }
  };

  const post = async () => {
    if (editing) return saveEdit();
    if (!apiEnabled) { if (!preset) clearDraft(); setDone(true); onPublished?.(null); return; }
    setBusy(true);
    let escalated = false;
    try {
      const min = d.min === "" ? null : Number(d.min), max = d.max === "" ? null : Number(d.max);
      const r = await api<{ story?: { publicId?: string }; pending?: boolean; publicId?: string; message?: string | null }>("/v1/stories", { method: "POST", body: {
        companySlug: d.company, outcome: d.outcome, stage: d.stage, title: d.title.trim(), body: d.body.trim(),
        ...(d.role.trim() && { role: d.role.trim() }),
        ratings: d.ratings,
        ...(min !== null && max !== null && { salary: { min, max } }),
        ...(d.days !== "" && { daysWaited: Number(d.days) }),
        captchaToken: shield.getToken(),
      } });
      if (!preset) clearDraft();
      if (r.pending) {
        // Saved but held by the automatic review (a named person, an accusation stated as fact…).
        speak(r.message ?? "Saved. Your story goes up after a quick check.");
        onPublished?.(r.publicId ?? null);
        refresh();
        close(false);
        return;
      }
      setDone(true);
      onPublished?.(r.story?.publicId ?? null);
      refresh();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "captcha_escalate") { escalated = true; shield.escalate(); }
      // Goofy's refusals speak in his voice (with his face); everything else is a normal error.
      if (err instanceof ApiRequestError && err.message.startsWith("Goofy: ")) speak(err.message, "error");
      else toast.error(err instanceof ApiRequestError ? (err.fields ? Object.values(err.fields)[0] ?? err.message : err.message) : "Couldn't share right now. Your draft is saved; try again.");
    } finally { if (!escalated) shield.reset(); setBusy(false); }
  };

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) { if (done) { setD(EMPTY); } setRestored(false); }
  };
  const startOver = () => { clearDraft(); setD(EMPTY); setRestored(false); setStep(0); setReached(0); setTried(false); };

  const outcome = OUTCOMES.find((o) => o.id === d.outcome);
  const stage = STAGES.find((s) => s.id === d.stage);

  // ---------- steps ----------

  const steps: ReactNode[] = [
    // 1. Where
    <div key="where" className="space-y-5">
      <div>
        <Label hint={editing ? "Can't be changed on an existing story" : <button type="button" onClick={() => setListing(true)} className="font-bold text-primary hover:underline">Not listed? List it</button>}>Which company?</Label>
        <CompanyPicker value={d.company} onChange={(v) => set("company", v)} companies={companyList} disabled={!!editing} placeholder="Choose the company"
          footer={(close, q) => <button type="button" onClick={() => { close(); setListing(true); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-bold text-primary hover:bg-muted"><Plus className="size-4" />{q ? `List “${q}” on Ghosted` : "Not listed? List it"}</button>} />
      </div>
      <div>
        <Label>How far did you get?</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{STAGES.map(({ id, label, icon: Icon }, i) => <motion.button key={id} type="button" onClick={() => set("stage", id)} aria-pressed={d.stage === id} whileTap={{ scale: 0.96 }}
          className={cn("flex flex-col items-center gap-1.5 rounded-lg border-2 border-foreground px-2 py-3 text-center text-xs font-bold transition-colors", d.stage === id ? "bg-primary text-primary-foreground shadow-hard-sm" : "bg-card hover:bg-muted", i === 4 && "col-span-2 sm:col-span-1")}>
          <Icon className="size-5" />{label}
        </motion.button>)}</div>
      </div>
      <div>
        <Label hint="Optional">Your role</Label>
        <Input value={d.role} onChange={(e) => set("role", e.target.value)} maxLength={80} placeholder="e.g. Backend Engineer" className="h-11 border-2 border-foreground" />
      </div>
    </div>,

    // 2. What happened
    <div key="what" className="space-y-5">
      <div>
        <Label>How did it end?</Label>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">{OUTCOMES.map(({ id, label, icon: Icon, blurb, tone: t }) => <motion.button key={id} type="button" onClick={() => set("outcome", id)} aria-pressed={d.outcome === id} whileTap={{ scale: 0.97 }}
          className={cn("flex items-start gap-2.5 rounded-lg border-2 border-foreground p-3 text-left transition-colors", d.outcome === id ? "bg-primary text-primary-foreground shadow-hard-sm" : "bg-card hover:bg-muted")}>
          <Icon className={cn("mt-0.5 size-5 shrink-0", d.outcome !== id && t)} />
          <span className="min-w-0"><span className="block text-sm font-bold">{label}</span><span className={cn("block text-xs", d.outcome === id ? "opacity-85" : "text-muted-foreground")}>{blurb}</span></span>
        </motion.button>)}</div>
      </div>
      <div>
        <Label hint={`${d.title.trim().length}/90`}>Give it a title</Label>
        <Input value={d.title} onChange={(e) => set("title", e.target.value)} maxLength={90} placeholder={voice(tone, "e.g. Four rounds, one take-home, zero replies", "e.g. No reply after the final round")} className="h-11 border-2 border-foreground font-semibold" />
      </div>
      <div>
        <Label hint={<span className="tabular-nums">{d.body.trim().length < 40 ? `${40 - d.body.trim().length} more to go` : `${d.body.length}/4000`}</span>}>Tell the story</Label>
        <MarkdownEditor value={d.body} onChange={(v) => set("body", v)} placeholder={voice(tone, "Spill it. What happened, how long it took, and what the next candidate should know. No names of individuals.", "What happened, how long it took, and what the next candidate should know. Please don't name individuals.")} />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span><strong className="text-foreground">Markdown works:</strong> # headings, **bold**, _italic_, - lists, &gt; quotes, `code` and ``` code blocks</span>
          {!d.body.trim() && <button type="button" onClick={() => set("body", TEMPLATE)} className="inline-flex items-center gap-1 font-bold text-primary hover:underline"><Wand2 className="size-3.5" />Give me a structure</button>}
        </div>
      </div>
    </div>,

    // 3. Rate it
    <div key="rate" className="space-y-5">
      <div className="flex items-center gap-4 rounded-xl border-2 border-foreground bg-accent p-4">
        <AnimatePresence mode="wait" initial={false}>{flagScore !== null
          ? <motion.div key="score" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="shrink-0"><FlagScore score={flagScore} compact /></motion.div>
          : <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid size-16 shrink-0 place-items-center rounded-full border-2 border-dashed border-foreground/40 font-display text-xl font-bold text-muted-foreground">?</motion.div>}</AnimatePresence>
        <p className="text-sm">{flagScore === null ? voice(tone, "Rate all five and watch your Flag Score for this company appear. No pressure.", "Rate all five areas to see the Flag Score your story gives this company.") : <>Your story gives {company?.name ?? "them"} a <strong className={scoreTone(flagScore)}>{flagScore}</strong>. It's averaged with everyone else's.</>}</p>
      </div>
      <div className="space-y-2">{RATINGS.map(({ key, label, hint }) => <div key={key} className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border-2 px-3 py-2 transition-colors", d.ratings[key] ? "border-foreground bg-card" : "border-foreground/20 bg-muted/50")}>
        <span className="min-w-0"><span className="block text-sm font-bold">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
        <Stars label={label} value={d.ratings[key]} onChange={(n) => set("ratings", { ...d.ratings, [key]: n })} />
      </div>)}</div>
      <div>
        <Label hint="Optional, but it helps the next person a lot">Salary and waiting</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold text-muted-foreground">Min (₹ LPA)<Input inputMode="decimal" value={d.min} onChange={(e) => set("min", e.target.value.replace(/[^\d.]/g, ""))} placeholder="12" className="mt-1 border-2 border-foreground text-foreground" /></label>
          <label className="text-xs font-bold text-muted-foreground">Max (₹ LPA)<Input inputMode="decimal" value={d.max} onChange={(e) => set("max", e.target.value.replace(/[^\d.]/g, ""))} placeholder="18" className="mt-1 border-2 border-foreground text-foreground" /></label>
          <label className="col-span-2 text-xs font-bold text-muted-foreground sm:col-span-1">Days waited for a reply<Input inputMode="numeric" value={d.days} onChange={(e) => set("days", e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="21" className="mt-1 border-2 border-foreground text-foreground" /></label>
        </div>
      </div>
    </div>,

    // 4. Review and post
    <div key="post" className="space-y-5">
      <p className="text-sm text-muted-foreground">{voice(tone, "Here's exactly how it'll look in the feed. Last chance to fix that typo.", "This is how your story will appear in the feed.")}</p>
      <article className="rounded-xl border-2 border-foreground bg-card p-5 shadow-hard-sm">
        <div className="flex items-start gap-3">
          <Avatar seed={me.avatarSeed} pastel={me.pastel} size="sm" label={displayName(me)} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{displayName(me)}</p><p className="truncate text-xs text-muted-foreground">about <strong className="text-foreground">{company?.name ?? "a company"}</strong> · just now</p></div>
          {company && <CompanyMark company={company} size="sm" />}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {outcome && <span className="rounded-full border-2 border-foreground bg-accent px-2.5 py-0.5 text-[11px] font-bold uppercase">{outcome.label}</span>}
          {[stage?.label, d.role.trim()].filter(Boolean).map((t) => <span key={t} className="text-xs font-semibold text-muted-foreground">{t}</span>)}
        </div>
        <h3 className="mt-3 font-bold leading-snug">{d.title.trim()}</h3>
        <Markdown text={d.body} className="mt-1.5" />
        {flagScore !== null && <p className="mt-4 border-t-2 border-dashed border-foreground/15 pt-3 text-xs font-semibold text-muted-foreground">Flag Score from this story: <span className={cn("font-display text-sm font-bold", scoreTone(flagScore))}>{flagScore}</span>{d.min && d.max ? ` · ₹${d.min}–${d.max} LPA` : ""}{d.days ? ` · waited ${d.days} days` : ""}</p>}
      </article>
      <div className="flex items-center gap-3 rounded-lg border-2 border-foreground bg-muted/50 p-3">
        <Avatar seed={me.avatarSeed} pastel={me.pastel} size="sm" label={displayName(me)} />
        <p className="min-w-0 flex-1 text-sm"><span className="font-bold">Posting as {displayName(me)}</span><span className="block text-xs text-muted-foreground">{isPublic(me) ? "Your public details show on all your stories." : "You're anonymous: only your handle and avatar show."} Change it any time in Settings.</span></p>
      </div>
      {!editing && <HumanCheck shield={shield} />}
    </div>,
  ];

  const titles = [
    { t: voice(tone, "Where did this happen?", "Where did this happen?"), s: voice(tone, "Name the company. We'll handle the judging.", "Choose the company and how far the process went.") },
    { t: voice(tone, "Spill the tea", "What happened?"), s: voice(tone, "How it ended, and the receipts. Keep it factual, keep it useful.", "How it ended, and what the next candidate should know.") },
    { t: voice(tone, "Now rate them", "Rate the experience"), s: voice(tone, "Honest stars only. Companies can't pay to change these.", "Your ratings feed the company's Flag Score.") },
    editing
      ? { t: voice(tone, "Looking sharper?", "Review your changes"), s: voice(tone, "Save it and your story gets a little Edited badge. Honesty looks good on you.", "Saving marks the story as edited.") }
      : { t: voice(tone, "Looks good?", "Review and post"), s: voice(tone, "One quick look, then it's out there helping people.", "Check your story, then post it.") },
  ];

  return <Dialog open={open} onOpenChange={close}>
    <DialogContent className={cn(popup, "max-w-2xl")}>
      {done ? <div className={cn(popupBody, "grid place-items-center py-12 text-center")} data-lenis-prevent>
        {/* Finished: a happy ghost, then back to the feed. */}
        <motion.div initial={{ scale: 0.4, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="relative">
          <img src="/ghosted-mark.png" alt="" className="size-28 object-contain" />
          {[...Array(8)].map((_, i) => <motion.span key={i} className="absolute left-1/2 top-1/2 size-2.5 rounded-full" style={{ background: ["#6D28D9", "#F59E0B", "#22C55E", "#EF4444"][i % 4] }}
            initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos((i / 8) * Math.PI * 2) * 90, y: Math.sin((i / 8) * Math.PI * 2) * 90, opacity: 0 }} transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }} />)}
        </motion.div>
        <DialogTitle className="mt-5 font-display text-3xl">{voice(tone, "Receipts filed.", "Story shared.")}</DialogTitle>
        <DialogDescription className="mx-auto mt-2 max-w-sm">{apiEnabled ? voice(tone, "Somewhere, a candidate just dodged a six-round interview. That was you.", "Thank you. Your story is live and will help other candidates.") : "Preview mode: stories aren't saved here."}</DialogDescription>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => { setD(EMPTY); setDone(false); setStep(0); setReached(0); }}><PenLine />Share another</Button>
          <Button onClick={() => close(false)}><Sparkles />Back to the feed</Button>
        </div>
      </div> : <>
        <div className={popupBody} data-lenis-prevent>
          <StepHeader step={step} title={titles[step]!.t} subtitle={titles[step]!.s} />
          <Progress step={step} reached={reached} onJump={(i) => go(i)} />
          {restored && step === 0 && <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-primary bg-primary/10 px-3 py-2 text-xs font-semibold">
            <span>{voice(tone, "Picked up where you left off. Your draft was waiting.", "Your saved draft has been restored.")}</span>
            <button type="button" onClick={startOver} className="font-bold text-primary hover:underline">Start over</button>
          </p>}
          <div className="relative mt-6 overflow-x-clip">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div key={step} custom={dir} initial={{ x: dir * 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: dir * -40, opacity: 0 }} transition={{ duration: 0.2, ease: "easeOut" }}>
                {steps[step]}
              </motion.div>
            </AnimatePresence>
          </div>
          <AnimatePresence>{tried && problems[step]!.length > 0 && <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 space-y-1 rounded-lg border-2 border-flag-red bg-flag-red/10 p-3 text-sm font-semibold text-flag-red">
            {problems[step]!.map((p) => <li key={p} className="flex items-center gap-1.5"><XCircle className="size-4 shrink-0" />{p}</li>)}
          </motion.ul>}</AnimatePresence>
        </div>
        {/* Footer stays put while the step scrolls. */}
        <div className="flex items-center justify-between gap-2 border-t-2 border-foreground bg-card px-5 py-3 sm:px-7">
          {step > 0 ? <Button variant="outline" onClick={() => go(step - 1)}><ArrowLeft />Back</Button> : <span className="text-xs text-muted-foreground">{editing ? "Editing your story" : isBlank(d) ? "" : "Draft saved"}</span>}
          {step < STEPS.length - 1
            ? <Button onClick={() => go(step + 1)}>{STEPS[step + 1]!.label}<ArrowRight /></Button>
            : editing
              ? <Button onClick={() => void post()} disabled={busy} className="min-w-36">{busy ? <Loader2 className="animate-spin" /> : <Check />}{busy ? "Saving…" : "Save changes"}</Button>
              : <Button onClick={() => void post()} disabled={busy || shield.status !== "done"} className="min-w-36">{busy ? <Loader2 className="animate-spin" /> : <Sparkles />}{busy ? "Posting…" : shield.status !== "done" ? "Checking you're human…" : "Post story"}</Button>}
        </div>
      </>}
      <ListCompanyDialog open={listing} onOpenChange={setListing} onListed={(co) => set("company", co.id)} />
    </DialogContent>
  </Dialog>;
}
